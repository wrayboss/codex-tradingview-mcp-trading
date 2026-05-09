# Claude Code Instructions

This repo is now a Deriv synthetic-indices breakout + retest bot.

## Operating Posture

- Use `gpt-5.5` when the host exposes model choice for agent work on this repo.
- Work outcome-first: identify the target result, required evidence, allowed side effects, and stop condition before acting.
- Verify conclusions against repository files, command output, TradingView state, Deriv account state, or exported backtest artifacts. Do not guess.
- Keep changes narrow. This repo does not call the OpenAI API directly, so do not add an OpenAI SDK, model wrapper, or provider migration as part of instruction or prompt upgrades.
- Preserve runtime behavior unless the user explicitly asks for a strategy or execution change.

## Current Strategy

- Trade only `VOLATILITY_75` and `VOLATILITY_50`.
- Map to Deriv symbols `R_75` and `R_50`.
- Do not add Crash/Boom symbols to execution unless the user explicitly changes the strategy.
- Codex Strategy Lab research may inspect all known Deriv derived symbols, including Crash/Boom, Jump, Step, Range Break, baskets, Bull/Bear, and additional Volatility indices. This is read-only research access, not execution approval.
- `SYMBOL` in `.env` must be either `VOLATILITY_75` or `VOLATILITY_50`; omit it to iterate every symbol in `rules.json` during loop mode.
- Structure timeframe is 1H; entry timeframe is 15m.
- The bot must decide only on closed 15m bars.

## Main Commands

```powershell
npm test
npm run jarvis -- plan --json
npm run jarvis -- analyze --file <candle-json> --json
npm run codex:autonomy -- status
npm run codex:autonomy -- plan --symbols=VOLATILITY_75,VOLATILITY_50
npm run codex:doctor
npm run research:symbols
npm run research:candles -- VOLATILITY_75 --count=500 --granularity=900
npm run dry-run
npm run loop          # autonomous — runs every 15m bar close, no user input needed
npm run loop:dry      # autonomous loop, no orders placed
npm run trade         # single cycle
npm run safe-gate     # read-only execution-readiness gate; fails closed by default
npm run validate-backtest <tv-export.csv...>   # check 7 go-live gates
npm run launch        # launch TradingView Desktop with CDP on port 9222
```

Use `npm run dry-run` before live/demo order placement. Dry-run still authorizes Deriv and fetches candles, but it must never place orders.
Use `npm run safe-gate -- --check-deriv --explicit` only when Wrayboss explicitly asks for execution readiness in the current conversation. It is read-only and must fail closed if account state, open positions, approvals, risk env, or real-account locks are missing.
Use `npm run loop` for fully autonomous live/demo operation after backtest gates approve.

When reporting results, prefer:

- outcome or blocker first
- exact checks run second
- any remaining manual step last

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
| `src/derivSymbolRegistry.js` | Codex Strategy Lab research symbol catalogue and TradingView names |
| `src/strategyAutonomy.js` | Research-only Codex Autonomy Lab planning and candidate backtest scoring |
| `src/tradingJarvis.js` | Trading Jarvis command-center analysis, watchlist scan, and trade-desk guardrails |
| `scripts/jarvis.js` | Local Trading Jarvis CLI |
| `docs/codex-strategy-lab.md` | Read-only Codex research workflow and symbol-access boundary |
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

## OpenClaw / Wrayboss JARVIS

- Wrayboss JARVIS is allowed to use Claude Code and Codex CLI in this repo for Wrayboss-approved workflows.
- Treat `C:\Users\Administrator\Documents\GitHub\claude-tradingview-mcp-trading` as the canonical local repo path.
- Preserve this repo's safety rules even when OpenClaw has full local system access.
- For serious planning, major breakthroughs, or deep repo archaeology, use Claude Code Opus first. Codex should implement the reviewed Opus plan.
- Before and after changes, run `git status --short --branch`.
- For non-trivial repo work, prefer a worktree/branch rather than editing `main` directly.
- A Telegram `Jarvis status` request is handled by OpenClaw's local status script, not by this repo.

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

1. Run `pine/breakout_retest_v1.pine` Strategy Tester in TradingView on `DERIV:VOLATILITY_75_INDEX` and `DERIV:VOLATILITY_50_INDEX` (15m).
2. Export → Strategy Tester → export icon → **List of Trades** → save CSVs.
3. `npm run validate-backtest R_75.csv R_50.csv`
4. Validator writes `state/backtest-approved.json` with `approved: true/false`.
5. Bot blocks live orders until `approved: true`.

## TradingView MCP Workflow

1. Run `npm run launch` if TradingView is not already launched with CDP on port `9222`.
2. `tv_health_check` must report a connected TradingView target.
3. Open a 15m TradingView chart for `DERIV:VOLATILITY_75_INDEX` or `DERIV:VOLATILITY_50_INDEX`.
4. Optional helper: `node scripts/set-chart.js "Volatility 75 Index" 15`.
5. Paste `pine/breakout_retest_v1.pine` into TradingView's Pine Editor and add it to the chart.
6. Verify the Pine script compiles cleanly before exporting Strategy Tester List of Trades CSVs.

> **One-time manual step:** Steps 5–6 must be performed manually once per session before the bot runs.
> The file `pine/breakout_retest_v1.pine` is valid Pine Script v6; do NOT edit it via code.
> After adding it to the chart, confirm TradingView shows no Pine compile errors before proceeding.
> If this manual step has not been completed, stop there and report it as the current blocker instead of inferring chart readiness.

## Architecture Notes

- `src/cycle.js` exports `runCycle(config, rules, risk, opts)` — the unit of work per bar. Injectable `clientFactory` and `stateDir` allow full testing without network calls.
- `bot.js` is the thin CLI shell: PID lock, loop timing, multi-symbol iteration, and CSV I/O. It does not contain strategy logic.
- **Multi-symbol (loop mode):** `rules.symbols` = `["VOLATILITY_75", "VOLATILITY_50"]`. In loop mode, both symbols run sequentially per bar close. `state/traded-levels-R_75.json` and `state/traded-levels-R_50.json` are separate files.
- **Settlement monitoring:** enabled in single-cycle mode only (`monitorSettlement: true`). In loop mode (`monitorSettlement: false`), `reconcileUnsettled()` at the next cycle start handles outcomes. This keeps the loop non-blocking across symbols.
- `RiskManager.save()` flushes the history JSON in-place (used by `contractMonitor` after settlement).
- `DerivClient.sendRetry()` retries on `RateLimit` and `Timeout` error codes only.
- `buy()` uses plain `send()` — retry for orders is handled at the `placeOrderWithRetry()` level, which gets a fresh proposal each attempt.
- CSV has two row types per trade: an entry row (placed) and a SETTLE row (outcome known).
- Integration tests in `tests/integration.js` cover cycle guards, backtest gates, open-position blocks, no-signal paths, dry-run guarantees, live signal/order placement, retry exhaustion, settlement monitoring, and reconciliation logic.
