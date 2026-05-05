# Claude + TradingView MCP Trading

Breakout + retest trading bot for Deriv synthetic indices. The runtime entry point is `bot.js`, with strategy parameters in `rules.json`.

## Agent Posture

For reusable agent instructions and prompt-driven workflows in this repo:

- Use `gpt-5.5` when the host exposes model choice.
- Work outcome-first and evidence-first: state the intended result, verify it against repo files or live artifacts, and stop with either a verified result or a named blocker.
- Do not guess about Deriv account state, TradingView chart state, Pine compile status, or backtest approval state.
- Keep prompt and instruction upgrades narrow. This repo does not call the OpenAI API directly, so model upgrades here should target reusable instructions and prompts, not runtime trading code, unless the user explicitly asks for behavior changes.

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
| `npm run codex:doctor` | Print a redacted Codex readiness report — no secrets |
| `npm run research:symbols` | List Deriv derived/synthetic research symbols and TradingView names |
| `npm run research:candles -- <symbol>` | Fetch read-only research candles under ignored `state/` |
| `npm run trade` | Single live cycle — evaluate and place order if a signal fires and gates pass |
| `npm run loop` | Live autonomous mode — runs every 15m bar close indefinitely |
| `npm run loop:dry` | Autonomous loop without placing orders |
| `npm run validate-backtest <csv...>` | Check TradingView List of Trades exports against 7 go-live gates |
| `npm run launch` | Relaunch TradingView Desktop with CDP on port `9222` |
| `npm run codex:check` | Self-test the Codex MCP bridge |
| `npm run git:preflight` | Verify `origin`, current branch, and upstream wiring before push or PR work |
| `npm run scan:secrets` | Check tracked files for secrets and runtime artifacts before review |

## Validation / Merge Gate

Every PR must prove the safety and hygiene gates still hold:

```powershell
npm test
npm run codex:check
npm run scan:secrets
node scripts/validate-backtest.js
```

`node scripts/validate-backtest.js` with no CSV must exit with code `1` and print usage text. CI treats that as an intentional usage check, not as a broken workflow.

Do not work on local `main`; use a branch or isolated worktree for changes. PRs must not weaken live safety gates without explicit review, and runtime/private artifacts such as `.env`, `trades.csv`, `safety-check-log*.json`, `state/`, tokens, screenshots, and account artifacts must stay out of version control.

### Git Remote Safety Preflight

Run this before any push or PR work:

```powershell
npm run git:preflight
```

The preflight is verification-only. It does not change remotes, branches, trading state, or bot behavior.

It fails closed when:

- `origin` is not the canonical GitHub remote `wrayboss/claude-tradingview-mcp-trading`
- the current branch is `main`
- the current branch is missing an upstream or is wired to something other than `origin/<current-branch>`

Recommended operator flow:

1. Run `npm run git:preflight`.
2. If it fails on the remote, repoint `origin` to `https://github.com/wrayboss/claude-tradingview-mcp-trading.git`.
3. If it fails on branch safety, create or switch to a dedicated branch such as `codex/<topic>`.
4. If it fails on upstream wiring, set the upstream with `git push -u origin <branch>`.
5. Re-run `npm run git:preflight` and only continue with push or PR work after it passes.

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

The validator writes `state/backtest-approved.json`. Dry-run does not require this file. Demo non-dry-run requires `demoApproved: true`; real-account non-dry-run requires `realApproved: true`. `npm run validate-backtest <csv...>` exits successfully when demo approval is reached, even if gate 7 is still blocking real approval.

Real Deriv accounts have an additional hard block. A real account can only trade when all of these are true in the local environment:

```env
ALLOW_REAL_TRADING=true
DERIV_ALLOWED_REAL_LOGINID=exact_authorized_loginid
```

`DERIV_ALLOWED_REAL_LOGINID` must exactly match the loginid returned by Deriv authorization. Set `TRADING_KILL_SWITCH=true` to block all non-dry-run order placement for both demo and real accounts. Dry-run remains usable with the kill switch enabled.

Backtest approval is fingerprinted against `rules.json`, `pine/breakout_retest_v1.pine`, `package.json`, strategy name/version, symbols, timeframes, and validator schema. Any strategy/config/Pine/package change makes old approval stale; re-run `npm run validate-backtest <csv...>` after those changes.

For agent-run verification, treat the flow as complete only when the relevant command output or artifact confirms the state being claimed.

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

## Trade Journal and Settlement Truth

- `state/trade-events.jsonl` is a local append-only runtime audit journal for trade decisions, filled orders, and settlements.
- Journal events are written with deterministic IDs so repeated reconcile or monitor passes do not append duplicate event lines for the same decision or contract settlement.
- `trades.csv` settlement rows are idempotent by Deriv contract ID. A `SETTLE` row is appended once per `Contract ID`; later monitor/reconcile passes skip duplicates.
- Reconciliation can be safely rerun. If Deriv reports a contract as sold more than once, the bot does not duplicate settlement accounting artifacts in the journal or CSV.
- Runtime artifacts remain Git-ignored, including `state/`, `safety-check-log.json`, and `trades.csv`.
- This hardening does not change breakout, retest, confirmation, indicator, or entry behavior.

## Local Artifact Migration

On startup, the bot prepares local runtime files before it reads or writes trading state:

- Existing `trades.csv` files with the old BitGet/BTC schema are renamed to `trades.legacy-YYYYMMDD-HHMMSS.csv`, then a fresh Deriv CSV header is written.
- Existing `safety-check-log.json` files without the current `schemaVersion` are renamed to `safety-check-log.legacy-YYYYMMDD-HHMMSS.json`, then a fresh empty log is written.
- `state/` is created locally and ignored by Git. The bot does not create the old shared `state/traded-levels.json`; live fills write per-symbol files such as `state/traded-levels-R_75.json`.
- `state/trade-events.jsonl` is created locally as an append-only audit journal; invalid JSONL lines are ignored on load so the runtime can continue safely.
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
Gates 1-6 produce `demoApproved: true` for demo non-dry-run validation. Gates 1-7 produce `realApproved: true` for real-money validation. Real trading also requires `ALLOW_REAL_TRADING=true` and `DERIV_ALLOWED_REAL_LOGINID` to exactly match the authorized real account. The bot rejects missing, invalid, or stale approval records before any non-dry-run order path.

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
- `deriv_active_symbols` / `deriv_research_candles`
- `tv_research_set_chart`
- `strategy_evaluate_dry_run`

`deriv_candles` and `tv_set_chart` remain execution-shaped V75/V50 tools. Use the `research` tools for broad Deriv symbol study, including Crash/Boom, Jump, Step, Range Break, baskets, Bull/Bear, and additional Volatility indices. Research tools do not make a symbol execution-eligible.

Codex live trading is intentionally disabled by default. `CODEX_ALLOW_LIVE_TRADING=true` only reveals the experimental live tool, and that tool still refuses to place orders; use `npm run trade` or `npm run loop` after demo validation for bot execution.

See `docs/codex-strategy-lab.md` for the full Codex research workflow.

## TradingView Launch And Pine

Start TradingView Desktop with the Chrome DevTools Protocol port before using chart tools:

```powershell
npm run launch
```

That script resolves the installed TradingView Desktop executable from the current Windows AppX/MSIX package location, closes any running TradingView process, starts TradingView with `--remote-debugging-port=9222`, and checks `http://localhost:9222/json/version`. If TradingView is installed outside the normal package paths, see `docs/setup-windows.md` for the `TRADINGVIEW_EXE` override.

After launch, confirm the bridge can see TradingView:

```
tv_health_check
```

Then open a 15m chart for `DERIV:VOLATILITY_75_INDEX` or `DERIV:VOLATILITY_50_INDEX`, paste `pine/breakout_retest_v1.pine` into TradingView's Pine Editor, add it to the chart, and verify Strategy Tester has no Pine errors before exporting the List of Trades CSV.

This Pine editor step is manual. If it has not been completed in the current session, chart automation and backtest claims should stop at that blocker.

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
| `state/backtest-approved.json` | Gate results — `demoApproved` gates demo trading, `realApproved` gates real trading |
| `state/bot.pid` | PID lock — prevents concurrent bot instances |
| `state/trade-events.jsonl` | Append-only local audit journal for decisions, fills, and settlements |
| `state/traded-levels-R_75.json` | Levels that produced a V75 trade (not re-armed) |
| `state/traded-levels-R_50.json` | Levels that produced a V50 trade (not re-armed) |
| `safety-check-log.json` | Decision log (all cycles) |
| `trades.csv` | Executed signal log with idempotent settlement rows by contract ID |

This is automation infrastructure, not financial advice. Use demo mode and verify all behavior before risking real money.
