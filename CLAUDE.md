# Claude Code Instructions

This repo is now a Deriv synthetic-indices breakout + retest bot.

## Current Strategy

- Trade only `VOLATILITY_75` and `VOLATILITY_50`.
- Map to Deriv symbols `R_75` and `R_50`.
- Do not add Crash/Boom symbols unless the user explicitly changes the strategy.
- `SYMBOL` in `.env` must be either `VOLATILITY_75` or `VOLATILITY_50`; omit it to iterate every symbol in `rules.json` during loop mode.
- Structure timeframe is 1H; entry timeframe is 15m.
- The bot must decide only on closed 15m bars.

## Main Commands

```powershell
npm test
npm run dry-run
npm run loop          # autonomous — runs every 15m bar close, no user input needed
npm run loop:dry      # autonomous loop, no orders placed
npm run trade         # single cycle
npm run validate-backtest <tv-export.csv...>   # check 7 go-live gates
npm run launch        # launch TradingView Desktop with CDP on port 9222
```

Use `npm run dry-run` before live/demo order placement. Dry-run still authorizes Deriv and fetches candles, but it must never place orders.
Use `npm run loop` for fully autonomous live/demo operation after backtest gates approve.

## Important Files

| File | Purpose |
| --- | --- |
| `bot.js` | CLI entry point — PID lock, loop timing, multi-symbol, CSV I/O |
| `src/cycle.js` | Core strategy cycle (injectable for testing) — exported: `runCycle`, `reconcileUnsettled`, `placeOrderWithRetry` |
| `rules.json` | Strategy schema and tuned parameters |
| `src/indicators.js` | EMA, RSI, ATR, SMA, pivot helpers |
| `src/levels.js` | Active support/resistance store |
| `src/breakoutDetector.js` | Breakout and fakeout filters |
| `src/retestTracker.js` | Retest state machine |
| `src/confirmation.js` | Strong candle, pin bar, engulfing checks |
| `src/riskManager.js` | Daily cap, ATR-to-USD risk conversion, `save()` for in-place log updates |
| `src/contractMonitor.js` | Post-order polling loop (30s interval, 12h max) |
| `src/derivClient.js` | WebSocket client — `sendRetry()` for candles/status, plain `send()` for buy |
| `pine/breakout_retest_v1.pine` | TradingView strategy for backtesting |
| `scripts/validate-backtest.js` | Gate validator — parses TV CSV export, writes state/backtest-approved.json |
| `tests/integration.js` | Integration test suite — 11 tests, zero network calls (mock DerivClient) |

## Safety Rules

- Never print or commit `DERIV_API_TOKEN`.
- `.env` is local only.
- Use demo tokens until backtest and demo-forward gates pass.
- Respect `MAX_TRADES_PER_DAY`.
- Check Deriv portfolio/open contracts before placing live orders.
- Live modes are blocked unless `state/backtest-approved.json` has `approved: true`.
- `state/bot.pid` is the PID lock — delete it manually only if the bot crashed and left a stale file.

## Autonomous Operation

`npm run loop` is fully self-contained:
- No user input required after launch.
- Sleeps until each 15m bar close (UTC-aligned), wakes 2s after close.
- PID lock prevents two instances writing simultaneously.
- Order retry: 3 attempts with 1s / 5s / 10s backoff.
- Loop mode does not block on settlement; `reconcileUnsettled()` checks prior contracts at the next cycle start.
- Cycle errors are caught and logged; the loop continues regardless.

`npm run trade` runs one live cycle for the selected symbol or the first symbol in `rules.json`. If an order is placed, single-cycle mode stays alive until Deriv confirms settlement.

## Backtest Gate Workflow

1. Run `pine/breakout_retest_v1.pine` Strategy Tester in TradingView on R_75 and R_50 (15m).
2. Export → Strategy Tester → export icon → **List of Trades** → save CSVs.
3. `npm run validate-backtest R_75.csv R_50.csv`
4. Validator writes `state/backtest-approved.json` with `approved: true/false`.
5. Bot blocks live orders until `approved: true`.

## TradingView MCP Workflow

1. Run `npm run launch` if TradingView is not already launched with CDP on port `9222`.
2. `tv_health_check` must report a connected TradingView target.
3. Open a 15m Deriv chart for `R_75` or `R_50`.
4. Optional helper: `node scripts/set-chart.js "Volatility 75 Index" 15`.
5. Paste `pine/breakout_retest_v1.pine` into TradingView's Pine Editor and add it to the chart.
6. Verify the Pine script compiles cleanly before exporting Strategy Tester List of Trades CSVs.

> **One-time manual step:** Steps 5–6 must be performed manually once per session before the bot runs.
> The file `pine/breakout_retest_v1.pine` is valid Pine Script v6; do NOT edit it via code.
> After adding it to the chart, confirm TradingView shows no Pine compile errors before proceeding.

## Architecture Notes

- `src/cycle.js` exports `runCycle(config, rules, risk, opts)` — the unit of work per bar. Injectable `clientFactory` and `stateDir` allow full testing without network calls.
- `bot.js` is the thin CLI shell: PID lock, loop timing, multi-symbol iteration, and CSV I/O. It does not contain strategy logic.
- **Multi-symbol (loop mode):** `rules.symbols` = `["VOLATILITY_75", "VOLATILITY_50"]`. In loop mode, both symbols run sequentially per bar close. `state/traded-levels-R_75.json` and `state/traded-levels-R_50.json` are separate files.
- **Settlement monitoring:** enabled in single-cycle mode only (`monitorSettlement: true`). In loop mode (`monitorSettlement: false`), `reconcileUnsettled()` at the next cycle start handles outcomes. This keeps the loop non-blocking across symbols.
- `RiskManager.save()` flushes the history JSON in-place (used by `contractMonitor` after settlement).
- `DerivClient.sendRetry()` retries on `RateLimit` and `Timeout` error codes only.
- `buy()` uses plain `send()` — retry for orders is handled at the `placeOrderWithRetry()` level, which gets a fresh proposal each attempt.
- CSV has two row types per trade: an entry row (placed) and a SETTLE row (outcome known).
- Integration tests in `tests/integration.js` cover: EMA guard, backtest gate, open-position block, no-signal path, dry-run guarantee, live signal + order placement, retry exhaustion, and reconcile logic.
