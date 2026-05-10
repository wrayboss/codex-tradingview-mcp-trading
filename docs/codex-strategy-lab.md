# Codex Strategy Lab

Codex Strategy Lab is the research/operator layer for Deriv derived-market work. It is separate from bot execution.

## Boundary

- Research access can inspect all known Deriv derived/synthetic symbols.
- Execution remains limited to `VOLATILITY_75` and `VOLATILITY_50` unless the strategy, rules, constraints, Pine, tests, and backtest approval are intentionally expanded.
- Crash/Boom, Jump, Step, Range Break, baskets, Bull/Bear, and additional Volatility symbols are research/chart/candle candidates only.
- Strategy manifests live under `strategies/<strategy_id>/`; a symbol can be research-supported without being execution-eligible.
- New validator output contains strategy-scoped approvals so approval for one strategy version and symbol does not approve unrelated strategies or symbols.
- Research commands must not write `.env`, `rules.json`, `state/backtest-approved.json`, `trades.csv`, or `safety-check-log.json`.
- Live/demo order placement still requires explicit user instruction in the current conversation and the existing repo gates.

## Commands

```powershell
npm run codex:doctor
npm run runtime:health
npm run codex:autonomy -- status
npm run codex:autonomy -- plan --symbols=VOLATILITY_75,CRASH_500 --objective="rank research candidates"
npm run jarvis -- plan --json
npm run jarvis -- morning-brief --json
npm run jarvis -- morning-brief --symbols=VOLATILITY_75,VOLATILITY_50 --include-research=CRASH_500,BOOM_1000 --timeframes=60,15 --json
npm run jarvis -- analyze --file state/research/candles/VOLATILITY_75-900s-500.json --json
npm run jarvis -- scan --file state/research/watchlist.json --json
npm run jarvis -- compare-strategy --json
npm run jarvis -- compare-strategy --current-summary state/research/reports/breakout-summary.json --research-summary state/research/reports/v75-research-summary.json --json
npm run jarvis -- trade-desk --json
npm run research:symbols
npm run research:symbols -- --json
npm run research:candles -- VOLATILITY_75 --count=500 --granularity=900
npm run research:candles -- CRASH_500 --count=500 --granularity=900
npm run codex:autonomy -- backtest --file state/research/candles/VOLATILITY_75-900s-500.json
```

`npm run codex:doctor` prints a redacted local readiness report. It never prints `DERIV_API_TOKEN`.

`npm run runtime:health` is a read-only local artifact report. It makes no Deriv, TradingView, or network calls and reports safety-log presence, trade counts, unsettled counts, journal line counts, skipped invalid journal lines, backtest approval flags, and CSV settlement rows.

`npm run research:symbols` fetches Deriv `active_symbols` without account authorization when possible, then normalizes records into Codex aliases and TradingView chart names. Use `--offline` for the repo fallback catalogue.

`npm run research:candles` fetches read-only Deriv candles and writes JSON under `state/research/candles/`, which is ignored by Git through the existing `state/` rule.

`npm run codex:autonomy` is the guarded local research loop. It reports available Codex capabilities, builds a mission plan, and ranks deterministic candidate strategy ideas against candle JSON. It never approves execution, writes `.env`, edits `rules.json`, or places orders.

Research campaigns are represented by `src/researchCampaigns.js`. They build
read-only mission definitions, batch plans, walk-forward-ready evidence flow, and
rejection-memory skips. Results should be remembered through
`src/experimentLedger.js` under `state/research/experiment-ledger.jsonl`.

`npm run jarvis` is the local Trading Jarvis command center. It can produce roadmap, morning-brief, chart-analysis, watchlist-scan, strategy-builder, backtest-operator, and trade-desk checklists. Analysis, scan, and morning-brief commands remain research/operator surfaces; only the existing validated bot commands can place orders.

`npm run jarvis -- compare-strategy` lines up the current executable Breakout Retest strategy against `pine/v75_ema_rsi_momentum_research_v1.pine`. It is read-only, uses the existing local V75 research evidence by default, and computes metric deltas only when both sides are given parsed TradingView Strategy Tester summary objects.

## Current Research Candidate

`pine/v75_ema_rsi_momentum_research_v1.pine` mirrors the best current local V75 candidate from `npm run codex:autonomy -- backtest`. It is research-only and does not change live execution eligibility.

Measured against `VOLATILITY_75` 15m Deriv candles, 5000 bars, split 3500 train / 1500 test:

- Params: EMA 200, RSI 14, long RSI >= 62, short RSI <= 38, 8-bar time exit, 2 ATR stop, 3.5 ATR target.
- Full local run: 272 trades, 56.62% win rate, 1.53 profit factor, +16190.55 points, 4064.28 max drawdown points.
- Train: 194 trades, 57.22% win rate, 1.40 profit factor, +8871.89 points, 4064.28 max drawdown points.
- Test: 72 trades, 56.94% win rate, 1.99 profit factor, +7352.09 points, 968.63 max drawdown points.

This local result is candidate evidence only. It is not a money-ready approval and it must still pass TradingView Strategy Tester export validation through `npm run validate-backtest <csv...>` before demo or live promotion.

## MCP Tools

Execution-shaped tools remain narrow:

- `tv_set_chart`: V75/V50 only.
- `deriv_candles`: V75/V50 only.
- `strategy_evaluate_dry_run`: existing strategy only.
- `deriv_place_multiplier_trade`: hidden by default and still blocked even when exposed.

Research-shaped tools are broad and read-only:

- `deriv_active_symbols`: current Deriv derived/synthetic symbol catalogue.
- `deriv_research_candles`: read-only candles for any known research symbol.
- `tv_research_set_chart`: chart navigation for any known research symbol.
- `strategy_autonomy_status`: current Codex autonomy capabilities and guardrails.
- `strategy_autonomy_plan`: research-only mission plan for symbols and candle counts.
- `strategy_candidate_backtest`: local candidate-strategy scoring from inline candles or a repo-local candle JSON file.
- `jarvis_command_center`: chart/account/tool summary for the Trading Jarvis operator view.
- `jarvis_analyze_chart`: candle and setup analysis without execution approval.
- `jarvis_scan_watchlist`: multi-symbol research scan with execution eligibility labels.
- `jarvis_morning_brief`: read-only morning brief plan with runtime health context, recommended TradingView tasks, and no execution or scheduling.
- `jarvis_strategy_compare`: read-only current-vs-research strategy comparison with metric deltas, execution boundaries, and the next backtest/promotion step.
- `jarvis_trade_desk_check`: fail-closed readiness checklist for explicit demo/live requests.

Morning brief mode is intentionally future-ready but not automated. It sets `readOnly: true`, `tradeExecutionAllowed: false`, `schedulingEnabled: false`, and `liveTradingEnabled: false`. Future scheduling can be layered with Windows Task Scheduler after review, but this repo does not schedule it yet.

## Symbol Source

The repo fallback catalogue in `src/derivSymbolRegistry.js` was seeded from Deriv's public `active_symbols` response for `product_type=basic`. The live tool should be preferred before serious research because Deriv can add, remove, or rename symbols.

TradingView chart symbols use the `DERIV:` namespace and display-name-derived names such as:

- `R_75` -> `DERIV:VOLATILITY_75_INDEX`
- `1HZ75V` -> `DERIV:VOLATILITY_75_1S_INDEX`
- `BOOM500` -> `DERIV:BOOM_500_INDEX`
- `CRASH500` -> `DERIV:CRASH_500_INDEX`
- `JD75` -> `DERIV:JUMP_75_INDEX`
- `RB100` -> `DERIV:RANGE_BREAK_100_INDEX`

Step symbols are available in the registry, but chart-side naming should be verified in TradingView before treating a Step chart as confirmed.

## Promotion Path

Research candidates move toward execution only through this path:

1. Fetch enough candles with `research:candles`.
2. Build or update an isolated strategy implementation and tests.
3. Backtest locally and reject weak or overfit candidates.
4. Validate Pine in TradingView when available.
5. Export Strategy Tester trades and run `npm run validate-backtest <csv...>`.
6. Confirm the generated `strategyApprovals` entry matches the exact strategy id,
   strategy version, symbol, timeframes, rules hash, Pine hash, validator schema,
   and runtime fingerprint.
7. Recheck `state/backtest-approved.json`.
8. Only then consider dry-run or explicit demo execution for that strategy-symbol pair.

See `docs/multi-strategy-platform.md` for the full platform model.
