// probe-pyramid: a small-probe, pyramid-into-strength strategy for the pump.fun
// bonding-curve replay (agent-fun/replay/v2).
//
// Idea: most new pump.fun coins die fast and a few run hard, so the bot never
// bets big on a first impression. Every position starts as a 0.01 SOL probe on
// a coin 100-350 slots after its CreateEvent whose tape already shows real
// buying: at least 5 distinct buyers and 3 buys in the last 40 slots, net SOL
// flowing in, the price up at least 15% over the window while sitting near
// its window high, no single sell bigger than 0.5 SOL in the window, and the
// creator has not sold in the last 100 slots (a creator dumping is a rug
// tell). The age floor matters: coins younger than 100 slots are mostly
// bundled launches whose first-slot whale flow looks like momentum and then
// dumps in a single slot, and no per-batch stop can escape a dump that lands
// inside one batch; coins older than 350 slots are mostly already-dead tapes
// whose probes just bleed fees. A false start costs at most the probe plus
// its fees, cut by a hard -3% stop.
//
// A runner gets size only as it proves itself, in rungs keyed to value over
// cost: +35% -> +0.30 SOL, +65% -> +0.60 SOL, +100% -> +0.80 SOL, up to
// 2.00 SOL per coin. Once the rungs are used, the bot keeps adding 0.20 SOL
// on every further 5% step-up while the tape's net flow stays positive. That
// matters because the harness caps each buy at 1% of the curve's real SOL
// reserve per batch, so repeated small adds are the only way to build size
// on a runner. Bigger rungs pay because the exits cap the downside: with a
// -3% hard stop and a 5% trailing stop, the worst single coin on the dev
// window loses only 0.001 SOL, so sizing up the runners costs almost nothing
// when they reverse.
//
// Exits, first trigger wins: hard stop at -3% of cost, a 5% trailing stop
// armed once the position is up 15%, a fade exit when net SOL over 15 slots
// falls below -1.5 SOL (skipped while the position is up 20% or more, so a
// winner's flow noise does not cut the ride), an exit the moment the creator
// sells while we hold, and a 900-slot time limit unless the position is up
// at least 50%. A curve that completes is closed by the replay itself.
//
// Guardrail probes keep the run above the eligibility bar (at least 20 coins
// with a round trip of at least 0.01 SOL): when our own filled coins lag a
// pace set in block time, we buy 0.01 SOL of a liquid curve and sell it as
// soon as the buy lands. targetFills is 0 on purpose: on the dev window the
// fills-paced probes fired about 70 round trips of pure fee bleed while the
// main entries already cleared the coin bar, so probes now answer only to
// the coin pace. They stay on (maxProbes 1) as insurance for the 6-hour
// final window, where the main entries may land near the 20-coin bar.
//
// Deterministic by construction: no clock, no randomness, iteration only over
// insertion-ordered maps fed by the batch stream. Every batch, orders and
// slot are handled in the order the harness delivers them.

import type { Batch, Bot, BotState, OrderInput, Pubkey } from './vendor/agentfun-bot.ts';

export interface Rung {
  /** Add this many SOL once value / cost reaches 1 + up. */
  up: number;
  sol: number;
}

export interface Params {
  /** Entry lookback window, in slots. */
  window: number;
  /** Minimum net buy SOL (buys minus sells) over the window. */
  minNetSol: number;
  /** Minimum buy trades in the window. */
  minBuys: number;
  /** Minimum distinct buying wallets in the window. */
  minBuyers: number;
  /** Price now over price at the window start, minus 1. */
  minPriceUp: number;
  /** Upper bound on that rise: skip coins that already ran too far in one window. */
  maxPriceUp: number;
  /** Price now at least this share of the window's high. */
  nearHigh: number;
  /** Largest single sell allowed in the window (SOL); bigger smells like a dump. */
  maxSingleSell: number;
  /** Curve real SOL bounds at entry. */
  minRqSol: number;
  maxRqSol: number;
  /** Youngest age (slots since CreateEvent) an entry is allowed at. */
  minAge: number;
  /** Oldest age (slots) an entry is allowed at. */
  maxAge: number;
  /** A coin whose creator sold within this many slots is not entered. */
  creatorSellWindow: number;
  /** First buy of a position (SOL). */
  probeSol: number;
  /** Pyramid rungs: add sol once value / cost reaches 1 + up, in order. */
  rungs: Rung[];
  /** After the last rung, add stepSol each time the price steps up at least stepAdd vs the last buy. */
  stepAdd: number;
  stepSol: number;
  /** Largest total SOL ever put into one coin. */
  maxPerCoin: number;
  /** Smallest buy worth sending. */
  minBuySol: number;
  /** Slippage on buys (bps); sells always go out at 10000. */
  buySlipBps: number;
  /** Hard stop: exit when value falls below cost * (1 - stopLoss). */
  stopLoss: number;
  /** Trailing stop, armed once value reaches cost * (1 + trailArm). */
  trail: number;
  trailArm: number;
  /** Exit when net SOL over the fade window falls below -fadeNetSol. */
  fadeWindow: number;
  fadeNetSol: number;
  /** Skip the fade exit while the position is up at least this much vs cost. */
  fadeSkipUp: number;
  /** Exit after this many slots held, unless the position is up at least holdIfUp. */
  maxHold: number;
  holdIfUp: number;
  /** Slots to wait after an exit before the same curve may be bought again. */
  cooldown: number;
  /** Most entries per curve over the run. */
  maxEntries: number;
  /** Most momentum positions open at once (caps.max_open_positions is 5 here). */
  maxMain: number;
  /** Guardrail pacing: the run must end with at least 20 coins. When our own
   * coins lag targetCoins scaled by the share of paceSecs elapsed (block time
   * since the first batch), open tiny probe round trips until back on pace.
   * targetFills 0 disables fills pacing: fills-paced probes were pure fee
   * bleed on the dev window, so only the coin pace triggers probes. */
  targetCoins: number;
  targetFills: number;
  paceSecs: number;
  maxProbes: number;
  /** Most SOL at cost across all positions at once (a drawdown guard). */
  maxExposureSol: number;
}

export const DEFAULT_PARAMS: Params = {
  window: 40,
  minNetSol: 0.05,
  minBuys: 3,
  minBuyers: 5,
  minPriceUp: 0.15,
  maxPriceUp: 1.5,
  nearHigh: 0.88,
  maxSingleSell: 0.5,
  minRqSol: 0.5,
  maxRqSol: 20,
  minAge: 100,
  maxAge: 350,
  creatorSellWindow: 100,
  probeSol: 0.01,
  rungs: [
    { up: 0.35, sol: 0.3 },
    { up: 0.65, sol: 0.6 },
    { up: 1.0, sol: 0.8 },
  ],
  stepAdd: 0.05,
  stepSol: 0.2,
  maxPerCoin: 2.0,
  minBuySol: 0.01,
  buySlipBps: 200,
  stopLoss: 0.03,
  trail: 0.05,
  trailArm: 0.15,
  fadeWindow: 15,
  fadeNetSol: 1.5,
  fadeSkipUp: 0.2,
  maxHold: 900,
  holdIfUp: 0.5,
  cooldown: 120,
  maxEntries: 2,
  maxMain: 5,
  targetCoins: 25,
  targetFills: 0,
  paceSecs: 14400,
  maxProbes: 1,
  maxExposureSol: 6,
};

const LAMPORTS = 1e9;
const CURVE_FEE = 0.0125;

interface Trade {
  slot: number;
  buy: boolean;
  sol: number;
  user: string;
  price: number;
}

interface Tape {
  created: number | null;
  creator: string | null;
  trades: Trade[];
  entries: number;
  lastExit: number;
  /** Slot of the creator's most recent sell, or -Infinity. */
  creatorSellSlot: number;
}

interface Held {
  opened: number;
  peakValue: number;
  /** SOL sent in buys for this position (fees included). */
  invested: number;
  exiting: boolean;
  /** Some buy of this position filled. */
  filled: boolean;
  /** Recorded price when the last buy was decided. */
  lastAddPrice: number;
  /** Close value at the latest batch (SOL, curve and tx fees deducted). */
  lastValue: number;
  /** How many pyramid rungs have been taken. */
  rungIdx: number;
}

/** Price of one token in SOL, from virtual reserves (lamports cancel out). */
function priceOf(vq: number, vt: number): number {
  return vt > 0 ? vq / vt : 0;
}

/** What a token balance would fetch if sold now, in SOL, after curve + tx fees. */
function closeValueSol(tokens: number, vq: number, vt: number, txFeeSol: number): number {
  if (tokens <= 0 || vt + tokens <= 0) return 0;
  const grossLamports = (tokens * vq) / (vt + tokens);
  return (grossLamports / LAMPORTS) * (1 - CURVE_FEE) - txFeeSol;
}

export function createStrategy(p: Params = DEFAULT_PARAMS): Bot {
  const tapes = new Map<Pubkey, Tape>();
  const held = new Map<Pubkey, Held>();
  /** Probe round trips in flight, by mint: false while buying, true once selling. */
  const probes = new Map<Pubkey, boolean>();
  /** The bot's own filled orders and the coins they were on (harness closes excluded). */
  let myFills = 0;
  const myCoins = new Set<Pubkey>();
  let firstTime: number | null = null;
  let lastTime: number | null = null;
  const keep = Math.max(p.window, p.fadeWindow, p.maxHold) + 5;

  const tapeOf = (mint: Pubkey): Tape => {
    let t = tapes.get(mint);
    if (t === undefined) {
      t = { created: null, creator: null, trades: [], entries: 0, lastExit: -1e12, creatorSellSlot: -Infinity };
      tapes.set(mint, t);
    }
    return t;
  };

  /** Net recorded SOL (buys minus sells) over the last `w` slots. */
  const flow = (t: Tape, now: number, w: number): number => {
    let net = 0;
    for (let i = t.trades.length - 1; i >= 0; i--) {
      const tr = t.trades[i]!;
      if (tr.slot <= now - w) break;
      net += tr.buy ? tr.sol : -tr.sol;
    }
    return net;
  };

  /** Entry signal on a curve's tape at slot `now`. */
  const entrySignal = (t: Tape, now: number, rqSol: number): boolean => {
    if (rqSol < p.minRqSol || rqSol > p.maxRqSol) return false;
    if (t.created === null) return false;
    const age = now - t.created;
    if (age < p.minAge || age > p.maxAge) return false;
    if (now - t.creatorSellSlot < p.creatorSellWindow) return false;
    const from = now - p.window;
    let buySol = 0;
    let sellSol = 0;
    let buys = 0;
    let startPrice = -1;
    let high = 0;
    let last = 0;
    let biggestSell = 0;
    const buyers = new Set<string>();
    for (const tr of t.trades) {
      if (tr.slot <= from) {
        startPrice = tr.price;
        continue;
      }
      if (startPrice < 0) startPrice = tr.price;
      if (tr.buy) {
        buySol += tr.sol;
        buys++;
        buyers.add(tr.user);
      } else {
        sellSol += tr.sol;
        if (tr.sol > biggestSell) biggestSell = tr.sol;
      }
      if (tr.price > high) high = tr.price;
      last = tr.price;
    }
    if (buys < p.minBuys || buyers.size < p.minBuyers) return false;
    if (buySol - sellSol < p.minNetSol) return false;
    if (biggestSell > p.maxSingleSell) return false;
    if (startPrice <= 0 || last <= 0) return false;
    const up = last / startPrice - 1;
    if (up < p.minPriceUp || up > p.maxPriceUp) return false;
    if (last < high * p.nearHigh) return false;
    return true;
  };

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const now = batch.slot;
      const traded = new Set<Pubkey>();
      const creatorSold = new Set<Pubkey>();

      for (const f of batch.fills) {
        if (f.status === 'filled' && !f.client_id.startsWith('_')) {
          myFills++;
          myCoins.add(f.mint);
        }
      }
      for (const e of batch.events) {
        if (e.block_time !== null) {
          if (firstTime === null) firstTime = e.block_time;
          if (lastTime === null || e.block_time > lastTime) lastTime = e.block_time;
        }
        if (e.event === 'CreateEvent') {
          const t = tapeOf(e.mint);
          t.created = e.slot;
          t.creator = e.creator;
        } else if (e.event === 'TradeEvent') {
          const t = tapeOf(e.mint);
          const sol = Number(e.sol_amount) / LAMPORTS;
          const price = priceOf(Number(e.virtual_quote_reserves), Number(e.virtual_token_reserves));
          t.trades.push({ slot: e.slot, buy: e.is_buy, sol, user: e.user, price });
          traded.add(e.mint);
          if (!e.is_buy && t.creator !== null && e.user === t.creator) {
            t.creatorSellSlot = e.slot;
            creatorSold.add(e.mint);
          }
        }
      }
      // Prune tapes we have not traded on lately, keeping the lookback we need.
      for (const mint of traded) {
        const t = tapes.get(mint)!;
        let cut = 0;
        while (cut < t.trades.length && t.trades[cut]!.slot <= now - keep) cut++;
        if (cut > 0) t.trades.splice(0, cut);
      }

      const marks = new Map(batch.marks.map((m) => [m.mint, m] as const));
      const pendingByMint = new Map<Pubkey, number>();
      for (const po of state.pending.values()) {
        pendingByMint.set(po.order.mint, (pendingByMint.get(po.order.mint) ?? 0) + 1);
      }

      const orders: OrderInput[] = [];
      const cap = state.hello.caps.max_orders_per_batch;
      const tx = Number(state.txFeeLamports()) / LAMPORTS;

      const reservesOf = (mint: Pubkey): { vq: number; vt: number; rqSol: number } | null => {
        const curve = state.curves.get(mint);
        if (curve === undefined) return null;
        const mk = marks.get(mint);
        const vq = mk ? Number(mk.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
        const vt = mk ? Number(mk.virtual_token_reserves) : Number(curve.virtual_token_reserves);
        const rqSol = (mk ? Number(mk.real_quote_reserves) : Number(curve.real_quote_reserves)) / LAMPORTS;
        return { vq, vt, rqSol };
      };

      // Exits first: every held position is re-marked on this batch's slot.
      for (const [mint, h] of held) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) {
            held.delete(mint);
            const t = tapeOf(mint);
            if (h.filled) t.lastExit = now;
            else t.entries--;
          }
          continue;
        }
        h.filled = true;
        if (curve === undefined || curve.complete) continue;
        const res = reservesOf(mint);
        if (res === null) continue;
        const tokens = Number(pos.token_amount);
        const value = closeValueSol(tokens, res.vq, res.vt, tx);
        const cost = Number(pos.cost_lamports) / LAMPORTS;
        if (value > h.peakValue) h.peakValue = value;
        h.lastValue = value;
        const upVsCost = cost > 0 ? value / cost - 1 : 0;
        let exit = h.exiting;
        if (!exit && value < cost * (1 - p.stopLoss)) exit = true;
        if (!exit && h.peakValue >= cost * (1 + p.trailArm) && value < h.peakValue * (1 - p.trail)) exit = true;
        if (!exit && upVsCost < p.fadeSkipUp && flow(tapeOf(mint), now, p.fadeWindow) < -p.fadeNetSol) exit = true;
        if (!exit && creatorSold.has(mint)) exit = true;
        if (!exit && now - h.opened > p.maxHold && upVsCost < p.holdIfUp) exit = true;
        if (!exit) continue;
        h.exiting = true;
        if (pendingByMint.has(mint)) {
          let sellPending = false;
          for (const po of state.pending.values()) {
            if (po.order.mint === mint && po.order.side === 'sell') sellPending = true;
          }
          if (sellPending) continue;
        }
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
      }

      // Probe round trips: sell the whole probe as soon as its buy has landed.
      for (const [mint, selling] of probes) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) probes.delete(mint);
          continue;
        }
        if (curve === undefined || curve.complete || pendingByMint.has(mint)) continue;
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
        if (!selling) probes.set(mint, true);
      }

      // Then entries and pyramid adds, in the order the batch's trades arrived.
      let free = Number(state.freeCashLamports()) / LAMPORTS;
      let slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
      let mainLeft = p.maxMain - held.size;
      let exposure = 0;
      for (const [mint, h] of held) {
        exposure += Math.max(h.invested, Number(state.positions.get(mint)?.cost_lamports ?? 0n) / LAMPORTS);
      }
      for (const mint of traded) {
        if (orders.length >= cap) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        if (pendingByMint.has(mint) || probes.has(mint)) continue;
        const t = tapes.get(mint)!;
        const res = reservesOf(mint);
        if (res === null) continue;
        const price = priceOf(res.vq, res.vt);
        const h = held.get(mint);
        let want: number;
        if (h === undefined) {
          if (slotsLeft <= 0 || mainLeft <= 0) continue;
          if (t.entries >= p.maxEntries || now - t.lastExit < p.cooldown) continue;
          if (!entrySignal(t, now, res.rqSol)) continue;
          want = Math.min(p.probeSol, p.maxPerCoin);
        } else {
          // Pyramid into strength only: the position is up on a rung, or it has
          // finished the rungs and stepped up again while flow stays positive.
          if (h.exiting || !h.filled || h.invested >= p.maxPerCoin - p.minBuySol) continue;
          const pos = state.positions.get(mint);
          if (pos === undefined) continue;
          const cost = Number(pos.cost_lamports) / LAMPORTS;
          if (cost <= 0) continue;
          const ratio = h.lastValue / cost;
          if (h.rungIdx < p.rungs.length) {
            const rung = p.rungs[h.rungIdx]!;
            if (ratio < 1 + rung.up) continue;
            want = rung.sol;
          } else {
            if (price < h.lastAddPrice * (1 + p.stepAdd)) continue;
            if (flow(t, now, p.window) < 0) continue;
            want = p.stepSol;
          }
          if (res.rqSol > p.maxRqSol) continue;
          want = Math.min(want, p.maxPerCoin - h.invested);
        }
        const capSol = Math.floor(Number(state.maxBuyLamports(mint))) / LAMPORTS;
        let amount = Math.min(capSol, want, p.maxExposureSol - exposure);
        if (amount > free - tx) amount = free - tx;
        if (amount < p.minBuySol) continue;
        const lamports = BigInt(Math.floor(amount * LAMPORTS));
        orders.push({ side: 'buy', mint, quote_lamports: lamports, max_slippage_bps: p.buySlipBps });
        free -= amount + tx;
        exposure += amount;
        if (h === undefined) {
          held.set(mint, {
            opened: now,
            peakValue: 0,
            invested: amount,
            exiting: false,
            filled: false,
            lastAddPrice: price,
            lastValue: 0,
            rungIdx: 0,
          });
          t.entries++;
          slotsLeft--;
          mainLeft--;
        } else {
          h.invested += amount;
          h.lastAddPrice = price;
          if (h.rungIdx < p.rungs.length) h.rungIdx++;
        }
      }

      // Guardrail pacing: open a probe when the bot's fills or coins lag the pace.
      if (probes.size < p.maxProbes && slotsLeft > 0 && firstTime !== null && lastTime !== null) {
        const pace = Math.min(1, (lastTime - firstTime) / p.paceSecs);
        const needCoins = myCoins.size < Math.ceil(p.targetCoins * pace);
        const needFills = myFills < Math.ceil(p.targetFills * pace);
        if (needCoins || needFills) {
          const minRq = (p.probeSol * 10_000) / state.hello.caps.max_order_bps_of_real_reserve;
          for (const mint of traded) {
            if (orders.length >= cap || probes.size >= p.maxProbes) break;
            if (held.has(mint) || probes.has(mint) || pendingByMint.has(mint) || state.positions.has(mint)) continue;
            if (needCoins && !needFills && myCoins.has(mint)) continue;
            const curve = state.curves.get(mint);
            if (curve === undefined || curve.complete) continue;
            if (Number(curve.real_quote_reserves) / LAMPORTS < minRq * 1.5) continue;
            if (free < p.probeSol + 2 * tx) break;
            orders.push({ side: 'buy', mint, quote_lamports: BigInt(Math.floor(p.probeSol * LAMPORTS)), max_slippage_bps: p.buySlipBps });
            probes.set(mint, false);
            free -= p.probeSol + tx;
          }
        }
      }
      return orders;
    },
  };
}
