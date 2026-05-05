# Codex Strategy Lab

Codex Strategy Lab is the research/operator layer for Deriv derived-market work. It is separate from bot execution.

## Boundary

- Research access can inspect all known Deriv derived/synthetic symbols.
- Execution remains limited to `VOLATILITY_75` and `VOLATILITY_50` unless the strategy, rules, constraints, Pine, tests, and backtest approval are intentionally expanded.
- Crash/Boom, Jump, Step, Range Break, baskets, Bull/Bear, and additional Volatility symbols are research/chart/candle candidates only.
- Research commands must not write `.env`, `rules.json`, `state/backtest-approved.json`, `trades.csv`, or `safety-check-log.json`.
- Live/demo order placement still requires explicit user instruction in the current conversation and the existing repo gates.

## Commands

```powershell
npm run codex:doctor
npm run codex:autonomy -- status
npm run codex:autonomy -- plan --symbols=VOLATILITY_75,CRASH_500 --objective="rank research candidates"
npm run jarvis -- plan --json
npm run jarvis -- analyze --file state/research/candles/VOLATILITY_75-900s-500.json --json
npm run jarvis -- scan --file state/research/watchlist.json --json
npm run jarvis -- trade-desk --json
npm run research:symbols
npm run research:symbols -- --json
npm run research:candles -- VOLATILITY_75 --count=500 --granularity=900
npm run research:candles -- CRASH_500 --count=500 --granularity=900
npm run codex:autonomy -- backtest --file state/research/candles/VOLATILITY_75-900s-500.json
```

`npm run codex:doctor` prints a redacted local readiness report. It never prints `DERIV_API_TOKEN`.

`npm run research:symbols` fetches Deriv `active_symbols` without account authorization when possible, then normalizes records into Codex aliases and TradingView chart names. Use `--offline` for the repo fallback catalogue.

`npm run research:candles` fetches read-only Deriv candles and writes JSON under `state/research/candles/`, which is ignored by Git through the existing `state/` rule.

`npm run codex:autonomy` is the guarded local research loop. It reports available Codex capabilities, builds a mission plan, and ranks deterministic candidate strategy ideas against candle JSON. It never approves execution, writes `.env`, edits `rules.json`, or places orders.

`npm run jarvis` is the local Trading Jarvis command center. It can produce roadmap, chart-analysis, watchlist-scan, strategy-builder, backtest-operator, and trade-desk checklists. Analysis and scan commands remain research/operator surfaces; only the existing validated bot commands can place orders.

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
- `jarvis_trade_desk_check`: fail-closed readiness checklist for explicit demo/live requests.

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
6. Recheck `state/backtest-approved.json`.
7. Only then consider dry-run or explicit demo execution.
