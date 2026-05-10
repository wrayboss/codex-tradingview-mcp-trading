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
npm run codex:autonomy -- sweep --files BOOM_500=state/research/candles/BOOM_500-900s-10000.json,CRASH_500=state/research/candles/CRASH_500-900s-10000.json,JUMP_75=state/research/candles/JUMP_75-900s-10000.json --json
```

`npm run codex:doctor` prints a redacted local readiness report. It never prints `DERIV_API_TOKEN`.

`npm run runtime:health` is a read-only local artifact report. It makes no Deriv, TradingView, or network calls and reports safety-log presence, trade counts, unsettled counts, journal line counts, skipped invalid journal lines, backtest approval flags, and CSV settlement rows.

`npm run research:symbols` fetches Deriv `active_symbols` without account authorization when possible, then normalizes records into Codex aliases and TradingView chart names. Use `--offline` for the repo fallback catalogue.

`npm run research:candles` fetches read-only Deriv candles and writes JSON under `state/research/candles/`, which is ignored by Git through the existing `state/` rule.

`npm run codex:autonomy` is the guarded local research loop. It reports available Codex capabilities, builds a mission plan, ranks deterministic candidate strategy ideas against candle JSON, and can produce a multi-symbol research matrix with `sweep`. It never approves execution, writes `.env`, edits `rules.json`, or places orders.

The `sweep` command ranks symbols before Pine work. It evaluates the best candidate per strategy family across full/train/test/recent splits and returns:

- Top 3 symbols by local robustness score.
- Top 2 strategy families per symbol.
- Full/train/test/recent metrics for every shortlisted family.
- Rejection notes when a candidate wins full-sample but fails train/test/recent robustness.

The default local gates target profit factor `1.6`, drawdown under `15%` of average local price, at least `20` full-sample trades, and at least `5` trades in each split. Passing these local gates only means "promoted for Pine review"; it never means demo/live approval.

Research campaigns are represented by `src/researchCampaigns.js`. They build
read-only mission definitions, batch plans, walk-forward-ready evidence flow, and
rejection-memory skips. Results should be remembered through
`src/experimentLedger.js` under `state/research/experiment-ledger.jsonl`.

`npm run jarvis` is the local Trading Jarvis command center. It can produce roadmap, morning-brief, chart-analysis, watchlist-scan, strategy-builder, backtest-operator, and trade-desk checklists. Analysis, scan, and morning-brief commands remain research/operator surfaces; only the existing validated bot commands can place orders.

`npm run jarvis -- compare-strategy` lines up the current executable Breakout Retest strategy against `pine/v75_ema_rsi_momentum_research_v7.pine`. It is read-only, uses the existing local V75 research evidence by default, and computes metric deltas only when both sides are given parsed TradingView Strategy Tester summary objects.

## Current Research Candidate

`pine/v75_ema_rsi_momentum_research_v7.pine` is the current local V75 candidate from the 10k-bar local grid search. It is research-only and does not change live execution eligibility.

Measured against `VOLATILITY_75` 15m Deriv candles, 10000 bars, split 7000 train / 2000 test / 1000 recent holdout:

- Params: EMA 175, RSI 14, long RSI >= 60, short RSI <= 38, 8-bar time exit, 2.5 ATR stop, 3.5 ATR target.
- Full local run: 616 trades, 54.06% win rate, 1.24 profit factor, +18643.79 points, 3881.75 max drawdown points.
- Train: 431 trades, 53.36% win rate, 1.18 profit factor, +9677.37 points, 3881.75 max drawdown points.
- Test: 105 trades, 52.38% win rate, 1.18 profit factor, +2539.92 points, 2024.02 max drawdown points.
- Recent 1000-bar holdout: 55 trades, 61.82% win rate, 1.57 profit factor, +3497.23 points, 1429.92 max drawdown points.

TradingView Strategy Tester visible validation for `DERIV:VOLATILITY_75_INDEX` 15m, Sep 30 2025 through May 10 2026, failed promotion gates on V7: 1329 trades, 51.24% profitable, 0.94 profit factor, 23.59% max equity drawdown, and about -14.98% Total P&L. V5 also remains a historical failed variant at 1193 trades, 47.95% profitable, 0.865 profit factor, 37.07% max equity drawdown, and about -31.22% Total P&L. The practical conclusion is that V7 is still research-only; it is not demo-approved or live-approved.

This local result is candidate evidence only. It is not a money-ready approval and it must still pass TradingView Strategy Tester export validation through `npm run validate-backtest <csv...>` before demo or live promotion.

### New Local Research Candidates

- `pine/v75_ema_rsi_momentum_research_v7.pine`
  - V75 15m, EMA 175 / RSI 14, long >= 60, short <= 38, 8-bar exit, 2.5 ATR stop, 3.5 ATR target.
  - Local evidence: 616 trades, 54.1% win rate, PF 1.24, +18643.79 pts, 3881.75 max DD.
  - Train/test/recent holdout PF: 1.18 / 1.18 / 1.57.
- `pine/v75_ema_rsi_momentum_research_v6.pine`
  - V75 15m, EMA 225 / RSI 14, long >= 60, short <= 38, 10-bar exit, 2 ATR stop, 2.5 ATR target.
  - Local evidence: 559 trades, 51.5% win rate, PF 1.18, +14222.48 pts, 6649.67 max DD.
  - Train/test/recent holdout PF: 1.05 / 1.37 / 2.84.
- `pine/v75_ema_rsi_momentum_research_v5.pine`
  - V75 15m, EMA 225 / RSI 14, long >= 64, short <= 38, 8-bar exit, 2 ATR stop, 2.5 ATR target.
  - Local evidence: 517 trades, 53.6% win rate, PF 1.25, +15903.01 pts, 4340.67 max DD.
  - Train/test/recent holdout PF: 1.10 / 1.35 / 2.81.
  - TradingView visible summary failed gates: PF 0.865 and 37.07% max drawdown.
- `pine/v75_ema_rsi_momentum_research_v4.pine`
  - V75 15m, EMA 100 / RSI 14, long >= 60, short <= 38, 10-bar exit, 2 ATR stop, 3 ATR target.
  - Local evidence: 293 trades, 53.9% win rate, PF 1.32, +12649.02 pts, 5455.93 max DD.
  - Train/test/recent holdout PF: 1.11 / 2.10 / 1.94.
  - TradingView visible summary failed gates: PF 0.905 and 36.59% max drawdown.
- `pine/v75_ema_rsi_momentum_research_v3.pine`
  - V75 15m, EMA 175 / RSI 14, long >= 62, short <= 38, 8-bar exit, 2 ATR stop, 3 ATR target.
  - Local evidence: 280 trades, 56.1% win rate, PF 1.48, +14747.76 pts, 2696.25 max DD.
  - Train/test split: PF 1.38 / 1.79.
- `pine/v75_ema_rsi_momentum_research_v2.pine`
  - V75 15m, EMA 100 / RSI 14, long >= 62, short <= 38, 8-bar exit, 2 ATR stop, 2.5 ATR target.
  - Local evidence: 319 trades, 54.5% win rate, PF 1.43, +16217.93 pts, 3065.90 max DD.
  - Train/test split: PF 1.33 / 1.75.
- `pine/v75_ema_rsi_momentum_research_v1.pine`
  - V75 15m, EMA 200 / RSI 14, long >= 62, short <= 38, 8-bar exit, 2 ATR stop, 3.5 ATR target.
  - Local evidence: 272 trades, 56.6% win rate, PF 1.53, +16190.55 pts, 4064.28 max DD.
  - Train/test split: PF 1.40 / 1.99.
- `pine/v50_rsi_mean_reversion_research_v2.pine`
  - V50 15m, EMA 34 / RSI 14, long <= 40, short >= 60, 6-bar exit, 1 ATR stop, 2 ATR target.
  - Local evidence: 557 trades, 43.8% win rate, PF 1.20, +21.94 pts, 9.04 max DD.
  - Train/test split: PF 1.18 / 1.27.

The practical read: V75 V7 is the strongest current momentum candidate by the 10k-bar local score. V6/V5/V4 remain useful historical live-failure variants. V3 and V2 stay as alternates. V50 is flatter and looks better as mean reversion. Treat them as separate research tracks until TradingView validation says otherwise.

### V100 Compression Break Retest Research

`pine/v100_compression_break_retest_short_trend_v3.pine` is the current V100 refinement candidate from the compression-break-retest family. It is research-only and does not change live or demo execution eligibility.

- Local saved-candle result: 85 trades, PF 1.613846261376639, +158.0503 points.
- Current local ranking also keeps `compression-break-retest-body-v3` strongest by score at 181 trades and PF 1.6810134245892845.
- TradingView visible Strategy Tester result for the V100 short-trend V3 candidate is rejected: PF 1.234, below the 1.6 promotion gate.
- Practical conclusion: keep V100 V3 as research evidence only. Do not approve, trade, or expand execution scope from this result.

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
- `strategy_research_matrix`: multi-symbol local research matrix with strict gates, shortlist, and rejection notes.
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
2. Run `npm run codex:autonomy -- sweep --files ... --json` to rank symbols and families.
3. Reject weak, overfit, low-trade, high-drawdown, or holdout-failing candidates.
4. Build or update an isolated strategy implementation and tests only for locally robust candidates.
5. Validate Pine in TradingView when available.
6. Export Strategy Tester trades and run `npm run validate-backtest <csv...>`.
7. Confirm the generated `strategyApprovals` entry matches the exact strategy id,
   strategy version, symbol, timeframes, rules hash, Pine hash, validator schema,
   and runtime fingerprint.
8. Recheck `state/backtest-approved.json`.
9. Only then consider dry-run or explicit demo execution for that strategy-symbol pair.

See `docs/multi-strategy-platform.md` for the full platform model.

## Multi-Symbol Families

The local candidate engine now separates strategy logic by symbol family:

- Crash/Boom: spike fade, spike continuation, post-spike cooldown, and compression-before-spike.
- Jump: jump impulse continuation, post-jump mean reversion, and jump volatility filter.
- Step: short-hold trend and mean reversion.
- Volatility indices: regime-filtered breakout, ATR compression breakout, and trend/chop classifier.
- V50 remains a secondary mean-reversion baseline.

Crash/Boom, Jump, Step, and non-watchlist Volatility work remains research-only unless the execution boundary is explicitly expanded later through rules, tests, Pine validation, and approval artifacts.
