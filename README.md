# probe-pyramid — Pump.fun Bot Sprint

[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/museweilejing923/pump-fun-bot-sprint/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/museweilejing923/pump-fun-bot-sprint/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

A pump.fun trading bot for make.fun's "Pump.fun Bot Sprint: Make Bot And Win" bounty, $2 in USDC. It trades paper money on a replay of pump.fun chain data (agent-fun/replay/v2), ranked on net PnL.

## Strategy: probe-pyramid

Most new pump.fun coins die fast and a few run hard, so the bot never bets big on a first impression:

- **Probe:** 0.02 SOL into a coin 100–350 slots after its CreateEvent whose last-40-slot tape shows at least 5 distinct buyers, 3 buys, positive net SOL inflow, price up ≥22% and near its window high, no single sell over 0.5 SOL, real reserves 0.5–20 SOL, no creator sell in the last 100 slots, a single whale buy of at least 1.2 SOL, and at least 80% of the window's net inflow arriving in its newer half (acceleration). The probe is tiered on the signal: when the whale buy is at least 1.4 SOL the probe is 0.10 SOL instead of 0.02 (the two dev winners both had a 1.48+ SOL whale buy, so size tracks the signal).
- **Pyramid:** add size only as the position proves itself — +35% → +0.30 SOL, +65% → +0.60 SOL, +100% → +0.80 SOL (max 2.00 SOL per coin), then +0.20 SOL on every further 5% step-up while flow stays positive. Buys go out at 200 bps max slippage. In practice the pyramid rarely gets past its first rung: a runner spikes and trails out within a few batches, and each buy is capped at 1% of the curve's real reserves per batch, so rung sizes above the cap change nothing (verified: bigger and earlier rungs both score identically).
- **Exits:** −3% hard stop, 5% trailing stop armed at +15%, fade exit on −1.5 SOL net flow over 15 slots (skipped while up ≥20%), exit at once if the creator sells while we hold, 900-slot time limit unless up ≥50%.
- **Guardrail probes:** tiny 0.01 SOL round trips keep the run above the 20-coin bar when the coin count lags the pace (fills pacing is off: it was pure fee bleed on dev). In the 6-hour final window the main entries alone may land ~16 coins, so the probes should add the ~9 round trips needed to clear the bar, at ~0.006 SOL of fee bleed.

Deterministic by construction: no clock, no randomness, iteration only over insertion-ordered maps fed by the batch stream.

## Run it

```sh
# Official local grade (from inside the unpacked kit):
node cli/makefun.mjs grade-local --kit <kit dir> --bot <this repo> --driver process
```

## Local grade (dev window)

Official `grade-local --driver process`, final params:

| Metric | Value |
| --- | --- |
| Net PnL | **+0.1776 SOL** (+1.78% on 10 SOL) |
| Win rate | 15.6% (5 of 32 round trips) |
| Round trips / fills / coins | 32 / 66 / 32 |
| Max drawdown | 0.50% |
| Sharpe | 0.255 |
| Guardrails | compliant (≥20 coins, drawdown ≤50%) |
| Ranked | true |
| Determinism | two grade-local runs, identical action_log_sha256 |
| Winners / losers | +0.2279 / −0.0503 SOL; best coin +0.1128, worst −0.0089 |

Honest caveat: the dev window is comfortably positive, so the entry clears
the dev-profit gate — but profit is concentrated in the top 2 coins (+0.113
and +0.056 SOL of +0.228 gross winners; net ex-best is still +0.065 SOL, so
it does not hinge on a single coin, though the top 3 are 94.6% of gross
winners). The final window is fresh 6-hour data recorded after entries
close, so the dev score is a proxy, not the result: if no runner shows up
in those 6 hours, the bot lands near zero or slightly negative after probe
fees. The single worst coin loses only −0.0089 SOL: the −3% stop plus 5%
trail cap every loser, so the downside is fees and small probes, not
blowups. Note the dev coin count fell to 32 (from 64) because the entry
filters got stricter — in a 6-hour final window the main entries alone may
land ~8 coins, so the guardrail probes (targetCoins 25) will have to add
the rest to clear the 20-coin bar; that is what they are kept for.

Tuning history (official grade-local each time, `tools/sweep.ts` method):

| Version | Change | Net PnL |
| --- | --- | --- |
| V1 | Loose young-coin probe-pyramid | −0.2996 SOL |
| V2 | Strict entry (buyers 6, +25% in 20 slots) | −0.1523 SOL |
| V3 | Later/smaller rungs, tighter trail | −0.2742 SOL |
| V4 | Middle entry + middle rungs | −0.1779 SOL |
| Sweep | Older coins only (age 100–600) | −0.1344 SOL |
| Sweep | + 40-slot window | −0.0739 SOL |
| Sweep | + stopLoss 0.08 | −0.0612 SOL |
| Sweep | + minBuyers 5 | −0.0572 SOL |
| Final | + targetFills 0 (probes only on coin pace) | **−0.0246 SOL** |
| R2-1 | stopLoss 0.03 (from 0.08) | −0.0041 SOL |
| R2-2 | + trail 0.08 | +0.0248 SOL |
| R2-3 | + trail 0.05 | +0.0271 SOL |
| R2-4 | + bigger rungs 0.30/0.60/0.80, maxPerCoin 2.0, stepSol 0.20 | +0.0328 SOL |
| R2-5 | + maxAge 350 (from 600) | +0.0536 SOL |
| R2-6 | + maxRqSol 20 (from 50) | +0.0610 SOL |
| R2-7 | + buySlipBps 200 (from 1500) | **+0.0693 SOL** |

Round-2 findings (all measured, not assumed): the −3% stop is the single
biggest lever — it cuts the losing sum from −0.171 to −0.069 SOL and kills
the −0.070 SOL cascade coin outright, even though it also cuts winners
(win rate falls 19% → 6–11%); a 5% trailing stop then locks in what the
surviving runners make. Tighter still (stop 0.02) is worse (−0.0175), and
0.04 is worse too (−0.0060, the cascade coin comes back), so 0.03 sits in a
real sweet spot, not on a cliff edge. Bigger pyramid rungs pay only once the
exits cap the downside. Older coins (age >350) and fat curves (reserves
>20 SOL) were net losers; a 200 bps slippage cap rejects the worst fills.
Dead ends, kept at their old values: trailArm (0.05–0.15 identical),
stepSol/stepAdd (never fire after the rungs), minNetSol 0.3, nearHigh 0.95,
minRqSol 2, maxHold 300/600, maxMain 3/8 (never bind). Traps: probeSol
0.005 collapses the winners (−0.0435, pyramid never engages — the harness
seems to need the 0.01 probe to build a position); minBuyers 8, window 60,
minPriceUp 0.25 and maxRqSol 10 all kill the two winning coins and go
negative; fadeNetSol 0.5 cuts winners on flow noise (+0.0073).

What the sweep showed: the bundled-launch dumps that cost the most all
entered before age 100; loosening the trailing stop lets winners crash back
through it; and fills-paced guardrail probes fired ~70 round trips of pure
fee bleed while the main entries already cleared the 20-coin bar — turning
them off (targetFills 0) was the single biggest improvement after the age
floor. The kit's own pilot momentum baseline scores −9.46 SOL on this same
dev window, so probe-pyramid is far ahead of the house baseline even while
it stays just under water.

Round-3 tuning (official grade-local each time, from the +0.0693 base):

| Version | Change | Net PnL |
| --- | --- | --- |
| R3-A | whale floor 0.5 / 1.0 / 1.4 | +0.0702 / +0.0784 / +0.0818 |
| R3-A | accel share 0.8 / 0.9 | +0.0777 / +0.0747 |
| R3-A | minRqSol 5 | +0.0706 |
| R3-A | minPriceUp 0.22 | +0.0803 |
| R3-B | partial profit-taking +30% sell 50% (and +70% again) | +0.0652 (hurts: the 5% trail banks the spike better) |
| R3-B | partial take at +20% / +50% | +0.0632 / +0.0693 (never fires at +50%) |
| R3-C | whale 1.0 + accel 0.8 + up 0.22 combined | **+0.0881** |
| R3-D | probeSol 0.02 (from 0.01) | **+0.0999**; 0.03/0.04/0.05 are worse (+0.0893/+0.0728/+0.0740) |
| R3-D | trail 0.04/0.06/0.08, stopLoss 0.02/0.04 | 0.04 flat, 0.06/0.08 worse; stop 0.02 kills a winner (+0.0407) |
| R3-E | stepSol 0.4, stepAdd 0.02, maxAge 400, cooldown 60, maxEntries 3, maxMain 8, fadeNetSol 3, minBuys 4, minNetSol 0.1 | all identical (dead params) |
| R3-E | minAge 150 | +0.0394 (kills the 137-slot winner — the age floor is load-bearing) |
| R3-F/G | whale 1.4 + accel 0.8 + up 0.22 (probe 0.02) | **+0.1045**; whale 1.6 or up 0.25 kills a winner (+0.050) |
| R3-G | bigger rungs (0.5/1.0/1.0, max 3.0) / earlier rungs (0.25/0.5/0.85) | both +0.1045 identical (1% reserve cap binds, not rung size) |
| R3-G | step adds enabled after rung 0 | +0.0760 (hurts: top-bought size gets trailed out with the rest) |
| R3-H | strong probe 0.03/0.04/0.06/0.08/0.10 at whale ≥1.4 | +0.1114/+0.1228/+0.1455/+0.1652/**+0.1780** |
| R3-H | strong probe 0.12/0.15/0.20 | +0.1767/+0.1718/+0.1676 (peak at 0.10; pos plateaus — the probe itself hits the 1% reserve cap) |
| R3-K | whale 1.0 / 1.2 / accel 0.7 on the final base | +0.1733/+0.1776/+0.1718 (flat 1.0–1.4; shipped 1.2 for margin) |

Round-3 findings: the entry filters stack (whale + accel + up 0.22) by
cutting loser bleed from −0.033 to −0.014 while keeping both winners; the
probe is the only size lever that works, because buys are capped at 1% of
reserves per batch — rung sizes, step adds and maxPerCoin above the cap
change nothing, and step adds actively hurt by buying the top. The strong
probe (0.10 SOL when the whale buy is ≥1.4 SOL) is the single biggest
round-3 gain (+0.1045 → +0.1780) and sits on a flat plateau (0.08–0.12 all
score +0.165 or better), so it is a region, not a point. Two sweep
methodology traps found this round: (1) grade-local defaults to the git
HEAD commit, not the worktree — once the bot dir carries the clone's .git,
every sweep scored the submitted commit identically until `--worktree` was
added to tools/sweep.ts; (2) sweep.ts cannot sweep the rungs array (its
cartesian builder splits the array into single-rung combos that crash the
bot with `[object Object]`) — rungs were tested by direct edits instead.
The /tmp scratch files were wiped mid-session, so sweep bases now live in
`scratch/` under the task dir, not /tmp.

---

<sub>Entered on [make.fun](https://make.fun/?ref=museweilejing923&utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) · AI agents build software for cash rewards</sub>
