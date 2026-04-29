# Claude + TradingView MCP Trading

Breakout + retest trading bot for Deriv synthetic indices. The runtime entry point is `bot.js`, with strategy parameters in `rules.json`.

## Strategy

- Supported bot symbols: `VOLATILITY_75` and `VOLATILITY_50`
- Deriv API symbols: `R_75` and `R_50`
- TradingView chart symbols: `DERIV:VOLATILITY_75_INDEX` and `DERIV:VOLATILITY_50_INDEX`
- Structure timeframe: 1H pivots
- Entry timeframe: 15m closed bars
- Setup: breakout close beyond confirmed 1H support/resistance → retest within 6 bars → confirmation candle → EMA50 + RSI14 alignment
- Execution: Deriv Multiplier contracts (`MULTUP` long, `MULTDOWN` short)

No Crash/Boom symbols. `bot.js` refuses to start when `SYMBOL` is not listed in `rules.json`.

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Fill in `.env`:

```env
DERIV_API_TOKEN=your_deriv_token_here
DERIV_APP_ID=129133

# Optional: set one symbol for single-symbol runs.
# Leave unset to run every symbol in rules.json during loop mode.
SYMBOL=VOLATILITY_75

# Optional risk overrides. Defaults come from rules.json.
# Leave MULTIPLIER unset for symbol defaults: VOLATILITY_75=50, VOLATILITY_50=80.
# If set, it must be valid for every active symbol.
# MULTIPLIER=50
STAKE_USD=10
STOP_LOSS_USD=5
MAX_TRADES_PER_DAY=3
```

`SYMBOL` accepts `VOLATILITY_75` or `VOLATILITY_50`. Deriv symbols are mapped internally to `R_75` and `R_50`; do not put `R_75`, `R_50`, Crash, or Boom symbols in `.env`.
Deriv multiplier stakes are locally blocked below `$1.00`; old `0.001` lot-size assumptions do not apply to this bot's stake-based multiplier orders.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the local test suite with no network calls |
| `npm run dry-run` | Connect to Deriv, evaluate strategy, log decision — no order |
| `npm run trade` | Single live cycle — evaluate and place order if a signal fires and gates pass |
| `npm run loop` | Live autonomous mode — runs every 15m bar close indefinitely |
| `npm run loop:dry` | Autonomous loop without placing orders |
| `npm run validate-backtest <csv...>` | Check TradingView List of Trades exports against 7 go-live gates |
| `npm run launch` | Relaunch TradingView Desktop with CDP on port `9222` |
| `npm run codex:check` | Self-test the Codex MCP bridge |

### Dry-Run And Live Flow

Use dry-run first:

```powershell
npm run dry-run
npm run loop:dry
```

Dry-run still requires `DERIV_API_TOKEN` because it fetches live Deriv candles, authorizes the account, and writes a decision to `safety-check-log.json`, but it never places an order.

Before live/demo order placement, validate TradingView backtests:

```powershell
npm run validate-backtest R_75-export.csv R_50-export.csv
```

The validator writes `state/backtest-approved.json`. `npm run trade` and `npm run loop` will not place orders until that file contains `approved: true`.

### Autonomous Operation

```powershell
npm run loop
```

The bot:
1. Calculates the next 15m bar close time and sleeps until 2 seconds after it
2. Connects to Deriv, reconciles any unsettled contracts from the previous cycle
3. Checks the backtest gate (`state/backtest-approved.json`) and open positions
4. Fetches 300 HTF bars + 500 LTF bars, runs the full strategy pipeline
5. Places an order if all filters pass and live gates are approved
6. Leaves settlement monitoring to the next cycle's reconciliation pass
7. Disconnects and waits for the next bar

A PID lock (`state/bot.pid`) prevents two instances running at once.
Stop with `Ctrl+C` — the lock is released on shutdown.

For a blocking one-cycle live run, use `npm run trade`; single-cycle mode monitors an opened contract until Deriv reports settlement and then appends a `SETTLE` row to `trades.csv`.

## Local Artifact Migration

On startup, the bot prepares local runtime files before it reads or writes trading state:

- Existing `trades.csv` files with the old BitGet/BTC schema are renamed to `trades.legacy-YYYYMMDD-HHMMSS.csv`, then a fresh Deriv CSV header is written.
- Existing `safety-check-log.json` files without the current `schemaVersion` are renamed to `safety-check-log.legacy-YYYYMMDD-HHMMSS.json`, then a fresh empty log is written.
- `state/` is created locally and ignored by Git. The bot does not create the old shared `state/traded-levels.json`; live fills write per-symbol files such as `state/traded-levels-R_75.json`.
- If an old shared `state/traded-levels.json` is found, it is migrated to the active symbol's per-symbol file. If that per-symbol file already exists, the shared file is archived instead of being mixed in.

## Backtest Validation

Before live trading, validate Pine Strategy Tester results:

1. Open `pine/breakout_retest_v1.pine` in TradingView on `DERIV:VOLATILITY_75_INDEX` (15m chart)
2. Run Strategy Tester — let it build at least 50 trades
3. Export: Strategy Tester → export icon → **List of Trades** → save as CSV
4. Repeat for `DERIV:VOLATILITY_50_INDEX`
5. Run the validator with both exports:

```powershell
npm run validate-backtest R_75-export.csv R_50-export.csv
```

The validator checks all 7 go-live gates and writes `state/backtest-approved.json`.
The bot will not place live orders until `approved: true` is in that file.

### Go-Live Gates

| # | Gate | Threshold |
| --- | --- | --- |
| 1 | Net profit after commission | > 0 |
| 2 | Win rate | ≥ 45% |
| 3 | Profit factor | ≥ 1.6 |
| 4 | Max drawdown | ≤ 15% |
| 5 | Trade count | ≥ 50 per symbol |
| 6 | Walk-forward degradation (70/30 split) | ≤ 20% |
| 7 | Demo settled trades with PF | ≥ 50 trades, PF ≥ 1.4 |

Gate 7 is read from `safety-check-log.json` (demo trades placed by the bot itself).

## Codex MCP Bridge

Install the Codex-side bridge:

```powershell
powershell -ExecutionPolicy Bypass -File .\codex-mcp\install-codex-config.ps1
```

The bridge exposes read and dry-run tools by default:

- `tv_health_check` / `tv_get_state` / `tv_list_indicators`
- `tv_add_indicator` / `tv_remove_indicator`
- `deriv_account_summary` / `deriv_candles`
- `strategy_evaluate_dry_run`

Codex live trading is intentionally disabled by default. `CODEX_ALLOW_LIVE_TRADING=true` only reveals the experimental live tool, and that tool still refuses to place orders; use `npm run trade` or `npm run loop` after demo validation for bot execution.

## TradingView Launch And Pine

Start TradingView Desktop with the Chrome DevTools Protocol port before using chart tools:

```powershell
npm run launch
```

That script closes any running TradingView process, starts TradingView with `--remote-debugging-port=9222`, and checks `http://localhost:9222/json/version`. If your install path differs, see `docs/setup-windows.md` or edit `launch.ps1`.

After launch, confirm the bridge can see TradingView:

```
tv_health_check
```

Then open a 15m chart for `DERIV:VOLATILITY_75_INDEX` or `DERIV:VOLATILITY_50_INDEX`, paste `pine/breakout_retest_v1.pine` into TradingView's Pine Editor, add it to the chart, and verify Strategy Tester has no Pine errors before exporting the List of Trades CSV.

Optional CDP chart helper:

```powershell
node scripts/set-chart.js VOLATILITY_75 15
node scripts/set-chart.js VOLATILITY_50 15
```

## Files

| File | Purpose |
| --- | --- |
| `bot.js` | CLI entry — PID lock, loop timing, multi-symbol, CSV I/O |
| `src/cycle.js` | Core strategy cycle — injectable, exported for testing |
| `rules.json` | Strategy schema and tuned parameters |
| `src/indicators.js` | EMA, RSI, ATR, SMA, pivot helpers |
| `src/levels.js` | Active support/resistance store |
| `src/breakoutDetector.js` | Breakout and fakeout filters |
| `src/retestTracker.js` | Retest state machine |
| `src/confirmation.js` | Strong candle, pin bar, engulfing checks |
| `src/riskManager.js` | Daily cap, ATR-to-USD risk conversion |
| `src/contractMonitor.js` | Post-order polling loop (30s interval, 12h timeout) |
| `src/derivClient.js` | WebSocket client with retry/backoff |
| `pine/breakout_retest_v1.pine` | TradingView strategy for backtesting |
| `scripts/validate-backtest.js` | Gate validator — reads TV CSV, writes backtest-approved.json |
| `tests/integration.js` | Integration tests — 11 tests, no network calls |
| `state/backtest-approved.json` | Gate results — must have `approved: true` for live trading |
| `state/bot.pid` | PID lock — prevents concurrent bot instances |
| `state/traded-levels-R_75.json` | Levels that produced a V75 trade (not re-armed) |
| `state/traded-levels-R_50.json` | Levels that produced a V50 trade (not re-armed) |
| `safety-check-log.json` | Decision log (all cycles) |
| `trades.csv` | Executed signal log with settlement rows |

This is automation infrastructure, not financial advice. Use demo mode and verify all behavior before risking real money.
