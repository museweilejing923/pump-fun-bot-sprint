# probe-pyramid — Pump.fun Bot Sprint

[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/museweilejing923/pump-fun-bot-sprint/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/museweilejing923/pump-fun-bot-sprint/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

A pump.fun trading bot for make.fun's "Pump.fun Bot Sprint: Make Bot And Win" bounty, $2 in USDC. It trades paper money on a replay of pump.fun chain data (agent-fun/replay/v2), ranked on net PnL.

## Strategy: probe-pyramid

Most new pump.fun coins die fast and a few run hard, so the bot never bets big on a first impression:

- **Probe:** 0.02 SOL into a coin 100–350 slots after its CreateEvent whose last-40-slot tape shows 5–8 distinct buyers, 3 buys, positive net SOL inflow, price up ≥22% and near its window high, no single sell over 0.25 SOL, real reserves 0.5–14 SOL at entry (the 14 cap is entry-only: reserves grow as a runner runs, so the pyramid adds still use the 20 cap), no creator sell in the last 100 slots, a single whale buy of at least 1.2 SOL, and at least 80% of the window's net inflow arriving in its newer half (acceleration). The probe is tiered on the signal: when the whale buy is at least 1.4 SOL the probe is 0.10 SOL instead of 0.02 (the two dev winners both had a 1.48+ SOL whale buy, so size tracks the signal).
- **Pyramid:** add size only as the position proves itself — +35% → +0.30 SOL, +65% → +0.60 SOL, +100% → +0.80 SOL (max 2.00 SOL per coin), then +0.20 SOL on every further 5% step-up while flow stays positive. Buys go out at 200 bps max slippage. In practice the pyramid rarely gets past its first rung: a runner spikes and trails out within a few batches, and each buy is capped at 1% of the curve's real reserves per batch, so rung sizes above the cap change nothing (verified: bigger and earlier rungs both score identically).
- **Exits:** −2% hard stop, 5% trailing stop armed at +15%, fade exit on −1.5 SOL net flow over 15 slots (skipped while up ≥20%), exit at once if the creator sells while we hold, 900-slot time limit unless up ≥50%.
- **Guardrail probes:** tiny 0.02 SOL scalps keep the run above the 20-coin bar when the coin count lags the pace (fills pacing is off: it was pure fee bleed on dev). A probe only fires on a coin whose last-15-slot net flow is at least +3 SOL, so coins already being dumped are skipped and the pace logic probes a different coin instead — and instead of selling the next batch (a flat sale loses the ~0.0007 fee floor every time), a probe is now held until it is up 3% or 900 slots pass, with **no stop-loss**: these coins move in single-batch jumps, so a probe that dips 2% and then spikes 10% becomes a win instead of a stopped loss. In the 6-hour final window the main entries alone may land ~16 coins, so the probes should add the ~9 round trips needed to clear the bar — and at a ~72% win rate they now add wins, not just fee bleed.

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
| Net PnL | **+0.2297 SOL** (+2.30% on 10 SOL) |
| Win rate | **72.4% (21 of 29 round trips)** |
| Round trips / fills / coins | 29 / 60 / 28 |
| Max drawdown | 0.41% |
| Sharpe | 0.336 |
| Guardrails | compliant (≥20 coins, drawdown ≤50%) |
| Ranked | true |
| Determinism | three grade-local runs, identical action_log_sha256 |
| Winners / losers | +0.2634 / −0.0337 SOL; best coin +0.1128, worst −0.0087 |
| Ex-top-3 / ex-best | **+0.0126** / +0.1170 SOL (net without the top 3 / best coin) |
| 2× fees | +0.1866 SOL (still strongly positive) |

Honest caveat: the dev window is comfortably positive, so the entry clears
the dev-profit gate — and the net without the top 3 coins is now **+0.0126
SOL** (it was +0.0098 on the +0.2269 version), and the win rate is
**72.4% (21 of 29 round trips)**, so the result no longer hinges on the
three biggest coins alone or on a handful of winners. But be clear about
what changed to buy that win rate: the guardrail probes now carry **no
stop-loss**, so the tail got fatter — the single worst coin now loses
−0.0087 SOL (a probe that dumped and never came back) instead of −0.0025,
and the loser sum grew −0.0177 → −0.0337. The winners grew more
(+0.2340 → +0.2634), so net still rose (+0.2163 → +0.2297), but if the
final window's probes dump harder than dev's, that tail is where the
damage lands. The top 3 are still 82% of gross winners, and the final
window is fresh 6-hour data recorded after entries close, so the dev score
is a proxy, not the result: if no runner shows up in those 6 hours, the
bot lands near zero or slightly negative after probe fees. Note the dev
coin count is 28 — in a 6-hour final window the main entries alone may
land ~8 coins, so the guardrail probes (targetCoins 25) will have to add
the rest to clear the 20-coin bar; that is what they are kept for. Round-6
honesty note: the round-6 gains are +0.0028 net and +1 win over the
+0.2269 version — one probe flip — and the two filters that produced them
do not stack with a lower whale floor, so treat the +0.2297 as "same
plateau, slightly better corner" rather than a new level.

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

Round-4 tuning (official grade-local each time, from the +0.1776 base; the
goal was net without the top 3 coins above zero while total net stays at or
above +0.1776):

| Version | Change | Net PnL |
| --- | --- | --- |
| R4-A | probeSol 0.01 / 0.005 (weak probe only; strong stays 0.10) | +0.1743 / +0.1759 (losers −0.011, but winners −0.015 too — the weak probe also sizes the guardrail probes, and the lucky guardrail win halves) |
| R4-A | targetCoins 20 / 15 | +0.1682 / +0.1642 (fewer guardrail probes lose the lucky +0.016 win; stays 25) |
| R4-B | maxRqSol 14 / 12 (global — also gates the pyramid adds) | +0.0844 (kills winners: reserves grow as a runner runs, so the adds get blocked; entry-time reserve values mislead) |
| R4-B | maxSingleSell 0.25 | +0.1848 (excludes the two big-sell losers, winners untouched) |
| R4-B | accelShare 0.9 | +0.1838 (same two losers, no stacking with 0.25) |
| R4-C | entry-only maxEntryRqSol 14 / 12 + maxBuyers 8 | +0.1972 (excludes the fat-curve and crowded losers, adds untouched) |
| R4-C | guardProbeSol 0.01 | +0.1939 (losers −0.019, but the lucky guardrail win vanishes) |
| R4-D | stopLoss 0.02 / 0.025 (from 0.03) | **+0.2021** (worst coin −0.0074 → −0.0025, winners intact — the R2 "0.02 kills a winner" finding does not replicate on this base) |
| R4-D | stopLoss 0.01 (trail 0.05) | +0.0881 (kills the best winner, +0.113 → +0.087) |
| R4-D | stopLoss 0.015 + trail 0.03 | +0.1218 (tighter trail cuts winners hard; stays 0.05) |
| R4-E | guardrail ride (hold up-probes on a 5% trail) | +0.2017 (no effect: only one probe is ever up at sell time) |
| R4-E | guardrail 15-slot flow ≥ 0 / 2 | **+0.2147 / +0.2163** (dodges the already-dumping probes; a replacement probe lands on a spiker) |
| R4-E | guardMinFlow15 3 / 4 | +0.2162 / +0.1975 (plateau at 2–3, too strict at 4) |

Round-5 tuning (official grade-local each time, from the +0.2163 base; the
goal was a win rate above 50% while total net stays at or above +0.10):

| Version | Change | Net PnL | Win rate |
| --- | --- | --- | --- |
| R5-A | guardrail scalp: hold probe to +3% / −2% / 120 slots (new structure) | +0.2189 | 41.4% (12/29) |
| R5-A | scalp TP 0.03–0.05 × SL 0.01 / 0.02 / 0.03 | +0.2145–0.2207 | 37.9–41.4% (TP level barely matters — the moves are jumps, not drifts) |
| R5-B | scalp time cap 60 / 300 / 600 | +0.2189 | 41.4% (cap never binds while a stop is on) |
| R5-C | breakeven stop on mains, arm +3% / +5% / +8% | +0.1048 / +0.1048 / +0.2189 | 37.9% / 37.9% / 41.4% (arming at +3–5% exits the best winner on its first retrace, best coin +0.113 → +0.087) |
| R5-D | scalp SL 0.05 / 0.08 (wider stop) | +0.2068–0.2137 | 44.8–51.7% |
| R5-D | **scalp SL 0 (no stop), TP 0.03** | **+0.2331** | **65.5% (19/29)** |
| R5-D | scalp SL 0, TP 0.05 | +0.2215 | 62.1% (18/29) |
| R5-E | SL 0, TP 0.02 / 0.025 / 0.04 at cap 120 | +0.2215–0.2331 | 62.1–65.5% (TP 0.02–0.03 plateau) |
| R5-F | SL 0, TP 0.03, cap 60 / 300 / 600 | +0.2218 / **+0.2269** / +0.2279 | 58.6% / **69.0%** / **69.0%** (20/29; cap 300–600 plateau) |
| R5-G | ride spiking probes on a 2–5% trail (arm +3%) | +0.2050–0.2097 | 57.1% (16/28 — a one-batch dump turns a banked +3% win into a −9% loss) |
| R5-H | SL 0, TP 0.02 / 0.025 at cap 300 | +0.2242 / +0.2269 | 69.0% (20/29; same wins as TP 0.03) |

Round-5 findings: per-token data showed the win-rate problem was the
guardrail probes — 13 of 16 lost exactly the −0.0007 fee floor by selling
the next batch, while the main entries already won 7 of 13 (54%). Turning
the probe into a scalp (hold to +3% or 300 slots) lifts the win rate to
41.4%, and the surprise is that **removing the stop-loss entirely** is
what unlocks the rest: with no stop, a probe that dips −2% and then spikes
+10% becomes a win instead of a stopped loss, and the win rate jumps to
65.5–69.0% with net still rising (+0.2163 → +0.2269). The stop was
protecting against the wrong risk — these coins move in single-batch
jumps, so a stop fires on noise and a take-profit fires on the jump. What
did not work: a breakeven stop on mains (runners retrace deeply before
they run, so arming at +3–5% cuts the best winner in half), riding
spiking probes on a trail (one-batch dumps turn banked wins into losses),
a time cap under 120 slots (too little time for the spike to arrive).
The cost of the win rate is a fatter tail: worst coin −0.0025 → −0.0087,
loser sum −0.0177 → −0.0381 — the winners (+0.2340 → +0.2649) pay for it
on dev, but a final window where probes dump harder would feel it. The
shipped version for the user's decision is the cap-300 row: 69.0% win
rate, +0.2269 net, ex-top-3 +0.0098, worst coin −0.0087.

Round-6 tuning (official grade-local each time, from the +0.2269 / 69.0%
base; the goal was net AND win rate up together — both had to beat the
base, not just one):

| Version | Change | Net PnL | Win rate |
| --- | --- | --- | --- |
| R6-A | trail 0.05 / 0.08 / 0.12 × stopLoss 0.02 / 0.025 / 0.03 | +0.2269 / +0.2269 / +0.1959 | 69.0% (trail 0.05 = 0.08 exactly — exits are single-batch jumps, so trail width never binds) |
| R6-B | strongProbe 0.10 / 0.12 / 0.15, maxPerCoin 2.0 / 3.0 | +0.2269 / +0.2160 / +0.2160 | 69.0% / 67.9% (bigger strong probe loses a trip; maxPerCoin never binds — the 1% reserve cap does) |
| R6-C | guardTakeUp 0.03–0.06 × guardMaxSlots 300 / 450 | +0.2269 → +0.2144–0.2177 | 69.0% → 65.5% (higher take-profit only delays the exit) |
| R6-D | guardProbeSol 0.02 / 0.03 / 0.04 × disaster stop 0 / −15% / −20% | +0.2269 → +0.1387–0.2223 | 69.0% → 53.5–65.5% (bigger probes explode the loser sum to −0.132; the disaster stop cuts the recovering dips too) |
| R6-E | minPriceUp 0.18 / 0.22 × accelShare 0.7 / 0.8 × minWhaleSol 1.0 / 1.2 | +0.2231–0.2291 | 61.3–69.0% (whale 1.0 alone: **+0.2291** / 69.0%; minPriceUp 0.18 adds 2 trips and drops the win rate) |
| R6-F | guardMinFlow15 1 / 2 / 3 × targetCoins 25 / 30 | +0.1732–0.2283 | 51.5–72.4% (flow 3 + coins 25: **+0.2283 / 72.4%**; coins 30 collapses the win rate to ~52–56%) |
| R6-G | rungs 0.25/0.45/0.65, 0.2/0.4/0.6, current 0.35/0.65/1.0 | +0.1641 / +0.1856 / **+0.2269** (earlier rungs buy the top — CTAA becomes the worst coin at −0.017) | 65.5% / 65.5% / 69.0% |
| R6-H | probeSol 0.02 / 0.03 × maxBuyers 6 / 8 / 10 | +0.2236–0.2269 | 65.5–69.0% (all five mains are strong probes, so probeSol never fires; buyers 10 drops a win) |
| R6-I | minWhaleSol 0.8 / 1.0 / 1.2 × guardMinFlow15 2.5 / 3 / 3.5 | +0.2099–0.2284 | 63.6–72.4% (the two filters do NOT stack: whale 1.0 + flow 3 = +0.2247) |
| R6-J | rung 2 only to +50% (0.35/0.50/0.65, 0.35/0.50/0.70) on flow-3 base | +0.2002 | 72.4% (the second add buys the top and the whole bigger position trails out worse) |
| R6-K | guardMaxSlots 300 / 600 / 900 on flow-3 base | +0.2283 / +0.2283 / **+0.2297** | 72.4% (900 is a peak — 1200/1500 fall to +0.2162/+0.2167) |
| R6-L | guardMaxSlots 600 / 900 / 1200 on whale-1.0 base | +0.2291 / **+0.2306** / +0.2170 | 69.0% (alternate finalist: best net, win rate flat) |
| R6-N/O | whale 1.0 + flow 3 + cap 900; whale 1.1 + cap 900 | +0.2261 / +0.2261 | 69.0% (the negative interaction persists; 1.1 excludes the coin that makes 1.0 good) |
| **R6 final** | **guardMinFlow15 3 + guardMaxSlots 900** | **+0.2297** | **72.4% (21/29)** |

Round-6 findings: the instrumented copy (scratch/instr6, ENTRY/EXIT/
SCALP-SELL logging) shows the two big winners peak at +56.3% / +54.7%
and exit on the trail at +46.4% / +40.4% with only rung 1 taken
(invested 0.275 / 0.216 SOL) — and CTAA (whale 7.90 SOL) peaks at
+33.6%, one point short of rung 1, so it never adds at all. The pyramid
cannot be fixed by moving the rungs: any earlier rung buys the top and
scores worse, because the exit is a single-batch jump and a bigger
position just gives back more. The only levers left with any give are
the guardrail probe filter (flow ≥3 skips one dumping probe) and the
scalp time cap (900 slots lets one timed-out probe recover instead of
selling the bottom) — each worth exactly one probe flip (+0.0014 net).
The shipped choice is the both-up corner (flow 3 + cap 900); the
alternate is whale 1.0 + cap 900 (+0.2306 / 69.0%), the best net with a
flat win rate. Either way the round-6 gain over the +0.2269 version is
~1% of net — inside one probe flip of noise — so do not read it as a
new level of edge.

Round-4 findings: per-token instrumentation (a scratch copy logging
ENTRY/SIGNAL/GUARD features to a file — console output is swallowed by the
process driver) showed the shipped version only makes 13 main entries (11
strong + 2 weak) and ~23 guardrail probes: the losers are 5 strong mains
(−0.0286) plus guardrail gross (−0.0213), and the guardrail probes are the
bigger pool. The entry filters stack by cutting the strong losers; the
guardrail flow filter cuts the probe bleed. What did not work: shrinking
the weak probe (it also sizes the guardrail probes), fewer guardrail probes
(they carry the lottery ticket), a global reserve cap (it gates the pyramid
adds, not just entries), stop 0.01 and trail 0.03 (both kill winners),
riding guardrail probes (nothing to ride — one up-probe in the whole
window). The ex-top-3 flip (+0.0007) is real on dev but thin: it leans on
one replacement probe's luck, so treat it as "no longer structurally
dependent on the top 3" rather than "robustly diversified".

---

<sub>Entered on [make.fun](https://make.fun/?ref=museweilejing923&utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) · AI agents build software for cash rewards</sub>
