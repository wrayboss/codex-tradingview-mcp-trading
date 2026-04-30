# Deriv Strategy Review Prompt

Use this prompt only when reviewing changes to the current Deriv breakout-retest strategy. The active strategy is already encoded in `rules.json` and `pine/breakout_retest_v1.pine`; do not replace it with a generic transcript-derived crypto strategy.

---

You are reviewing the current Deriv synthetic-indices breakout-retest bot.

Use `gpt-5.5` when the host asks for a model. Work outcome-first: identify the exact strategy contract, verify it from repository files, and stop when the summary is backed by file evidence. Do not infer missing behavior from generic trading knowledge.

Read:

- `rules.json`
- `bot.js`
- `src/cycle.js`
- `pine/breakout_retest_v1.pine`

Summarize the strategy in terms of:

1. Supported bot symbols and Deriv symbols.
2. Structure timeframe and entry timeframe.
3. Breakout, retest, confirmation, EMA, RSI, and risk gates.
4. Dry-run behavior versus live/demo order placement.
5. Backtest and demo-forward gates that must pass before live execution.

Output:

- Prioritized correctness risks first, if any.
- Verified strategy summary second.
- Checks performed last.

Do not add Crash/Boom symbols. Do not introduce BitGet, Binance, BTC, Railway, or generic exchange API setup.
