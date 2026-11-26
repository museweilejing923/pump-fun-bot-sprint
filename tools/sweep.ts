// Parameter sweep for probe-pyramid on the dev window, using the kit's own
// official grade (grade-local --driver process) as the scorer.
//
//   node tools/sweep.ts <kit dir> '<base params json>' '<grid json: {"key":[v1,v2],...}>'
//
// Each combination is applied to a throwaway copy of strategy.ts (the real
// file is never touched by this script), graded once, and reported as one
// line: mean net PnL, win rate, round trips, coins, the sum of winning and
// losing per-coin PnL, and the worst / best coins. The sweep that tuned the
// shipped DEFAULT_PARAMS ran in rounds from the loose-entry V1 base and
// found, in order: older coins only (minAge 100) dodges the bundled-launch
// dumps; a 40-slot window keeps the winners; stopLoss 0.08 helps a little;
// and targetFills 0 removes ~70 probe round trips of pure fee bleed while
// the main entries already clear the 20-coin bar.
//
// This tool is only for tuning. The bot never imports it; the grader's own
// engine is what scores the entry.

import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [kit, baseJson, gridJson] = process.argv.slice(2);
if (kit === undefined || gridJson === undefined) {
  console.error("usage: node tools/sweep.ts <kit dir> '<base json>' '<grid json>'");
  process.exit(2);
}
const base = JSON.parse(baseJson ?? '{}') as Record<string, unknown>;
const grid = JSON.parse(gridJson) as Record<string, unknown[]>;
const keys = Object.keys(grid);
const combos: Record<string, unknown>[] = [{}];
for (const k of keys) {
  const next: Record<string, unknown>[] = [];
  for (const c of combos) for (const v of grid[k]!) next.push({ ...c, [k]: v });
  combos.splice(0, combos.length, ...next);
}

const work = join(tmpdir(), `probe-pyramid-sweep-${process.pid}`);
cpSync(new URL('..', import.meta.url).pathname, work, { recursive: true });
const stratPath = join(work, 'strategy.ts');

const patch = (text: string, kv: Record<string, unknown>): string => {
  for (const [k, v] of Object.entries(kv)) {
    const lit = Array.isArray(v)
      ? `[${(v as { up: number; sol: number }[]).map((r) => `{ up: ${r.up}, sol: ${r.sol} }`).join(', ')}]`
      : String(v);
    if (k === 'rungs') text = text.replace(/rungs: \[.*?\]/s, `rungs: ${lit}`);
    else text = text.replace(new RegExp(`^(\\s+${k}: ).*?,$`, 'm'), `$1${lit},`);
  }
  return text;
};

for (const c of combos) {
  const merged = { ...base, ...c };
  writeFileSync(stratPath, patch(readFileSync(new URL('../strategy.ts', import.meta.url).pathname, 'utf8'), merged));
  const out = execSync(`node cli/makefun.mjs grade-local --kit ${kit} --bot ${work} --driver process --json`, { cwd: kit, encoding: 'utf8', timeout: 1_200_000 });
  const m = JSON.parse(out).result.performance.metrics;
  const pt = m.per_token as { realized_pnl_lamports: string; mint: string }[];
  const net = Number(m.net_pnl_lamports) / 1e9;
  const pos = pt.filter((x) => BigInt(x.realized_pnl_lamports) > 0n).reduce((s, x) => s + Number(x.realized_pnl_lamports) / 1e9, 0);
  const neg = pt.filter((x) => BigInt(x.realized_pnl_lamports) < 0n).reduce((s, x) => s + Number(x.realized_pnl_lamports) / 1e9, 0);
  const worst = [...pt].sort((a, b) => Number(BigInt(a.realized_pnl_lamports) - BigInt(b.realized_pnl_lamports)))[0]!;
  const best = [...pt].sort((a, b) => Number(BigInt(b.realized_pnl_lamports) - BigInt(a.realized_pnl_lamports)))[0]!;
  console.log(
    `net ${net.toFixed(4)} win ${m.win_rate} trips ${m.round_trips} coins ${m.distinct_mints} pos ${pos.toFixed(3)} neg ${neg.toFixed(3)} ` +
      `worst ${worst.mint.slice(0, 8)} ${(Number(worst.realized_pnl_lamports) / 1e9).toFixed(3)} best ${best.mint.slice(0, 8)} ${(Number(best.realized_pnl_lamports) / 1e9).toFixed(3)} ${JSON.stringify(c)}`,
  );
}
rmSync(work, { recursive: true, force: true });
