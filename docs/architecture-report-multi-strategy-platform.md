# Multi-Strategy Platform Architecture Report

## What Changed

- Added `strategies/<strategy_id>/` structure with manifests, local rules/config,
  Pine files, test pointers, and evidence notes.
- Migrated `breakout_retest_v1` as the current live gated strategy.
- Migrated `v75_ema_rsi_momentum_research_v1` as research-only.
- Added `src/strategyRegistry.js` for strategy discovery and lifecycle metadata.
- Added `src/strategyApproval.js` and updated validator/runtime gates so approval
  can be scoped to a strategy version and symbol instead of assumed repo-wide.
- Added `src/experimentLedger.js` for durable promoted and rejected experiment memory.
- Added `src/researchCampaigns.js` for read-only multi-symbol research campaign plans.
- Wired campaign and ledger concepts into the existing autonomy status/plan surface.
- Added tests in `tests/strategyPlatform.js` plus approval-record assertions in
  `tests/backtestValidator.js`.
- Updated docs with the research/execution boundary and promotion path.

## What Remains

- Root `rules.json` and `pine/breakout_retest_v1.pine` still drive current runtime
  behavior as compatibility mirrors.
- The full strategy factory is not built yet. Campaigns create mission definitions
  and batch plans, not autonomous code generation or promotion.
- Strategy-local test shards are still referenced from repo-level tests.
- Existing MCP tools are preserved; no live execution expansion was added.
- Crash, Boom, Jump, Step, Range Break, baskets, Bull/Bear, and extra Volatility
  symbols remain research-only until separately promoted.

## Why This Is Safer

- Research coverage can expand without broadening execution eligibility.
- Approval records bind strategy id, version, symbol, timeframes, rules hash,
  Pine hash, validator schema, and runtime/package fingerprint.
- A scoped approval for one strategy-symbol pair does not grant approval to another
  strategy, another symbol, or another version.
- Rejected experiments are remembered, so autonomous research can avoid repeating
  weak ideas.
- The current V75/V50 live path still passes the existing integration tests and
  remains behind the same account, kill-switch, open-position, risk, and backtest gates.

## Exact Next Best PR

Build the first executable campaign runner for research only:

1. Add a CLI such as `npm run research:campaign -- <campaign-json>`.
2. Load a campaign from `src/researchCampaigns.js`.
3. Fetch candles with the existing read-only research candle client.
4. Run deterministic local scoring per batch item.
5. Append every result to `state/research/experiment-ledger.jsonl`.
6. Produce a campaign report under `state/research/reports/`.
7. Keep approval and execution writes out of scope.

That PR should not add new execution symbols. Its acceptance gate should be a
queryable ledger with both promoted and rejected research outcomes across at least
one non-V75/V50 family.

