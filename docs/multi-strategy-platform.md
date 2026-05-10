# Multi-Strategy Research Platform

This repository now has a strategy-domain layer for multi-symbol Deriv research while
keeping live execution narrow and gated.

## Research Universe vs Execution Universe

Research can inspect the broad Deriv synthetic catalogue through
`src/derivSymbolRegistry.js`, live `active_symbols` when available, and read-only
research tools. This includes Crash, Boom, Jump, Step, Range Break, basket,
Bull/Bear, and Volatility symbols.

Execution is separate. A symbol being available for research does not make it
tradeable by the bot. Current execution remains limited to `breakout_retest_v1`
on `VOLATILITY_75` and `VOLATILITY_50`, subject to existing account, kill-switch,
open-position, risk, and backtest approval gates.

## Strategy Folders

Strategies live under `strategies/<strategy_id>/`.

- `strategies/breakout_retest_v1/`: live lifecycle, V75/V50 research and execution
  eligibility, runtime gate required.
- `strategies/v75_ema_rsi_momentum_research_v1/`: research lifecycle, V75 research
  support, no execution eligibility.

Root `rules.json` and `pine/breakout_retest_v1.pine` remain compatibility mirrors
for the current runtime. The strategy folders make the domain model explicit without
rewriting unrelated bot logic.

## Registry

`src/strategyRegistry.js` discovers `strategies/*/manifest.json` and exposes
strategy id, version, family, lifecycle state, supported research symbols,
execution-eligible symbols, Pine path, rules path, approval status, tests, and
evidence paths.

Allowed lifecycle states are `idea`, `research`, `candidate`, `validated`, `demo`,
`live`, `rejected`, and `retired`.

## Strategy-Scoped Approval

Backtest approval is no longer treated as a repo-wide permission. New approval
records contain `strategyApprovals`, keyed by strategy id, strategy version, symbol,
timeframe set, rules hash, Pine hash, validator schema version, package hash,
package-lock hash, and runtime fingerprint.

`src/liveSafetyGate.js`, `src/safeTradeGate.js`, and the Jarvis trade desk check
the scoped approval model when scoped records are present. Legacy top-level approval
fields remain for compatibility, but new validator output is strategy scoped.

This means a future `CRASH_500` strategy can be approved without approving
`BOOM_1000`, V75/V50, or a different strategy version.

## Experiment Ledger

`src/experimentLedger.js` provides a durable JSONL ledger at
`state/research/experiment-ledger.jsonl`. The ledger stores promoted and rejected
experiments with strategy id/version, symbol, timeframe, dataset source, parameters,
train/test/walk-forward metrics, rejection reason, promotion decision, artifact
paths, timestamp, and operator or agent source.

Rejected experiments remain queryable. Research campaigns use this memory to avoid
repeating known dead ideas.

## Research Campaigns

`src/researchCampaigns.js` defines the first campaign layer for autonomous
multi-symbol research. A campaign is read-only and produces a symbol universe,
strategy/symbol batch plan, candle artifact paths, walk-forward evidence flow,
rejection-memory skip decisions, and stop conditions that prevent approval or
execution side effects.

Campaigns may study Crash, Boom, Jump, Step, Range Break, baskets, Bull/Bear, and
Volatility symbols. They do not write `.env`, do not place orders, and do not write
`state/backtest-approved.json`.

## Promotion Path

Future strategies become live only through a per-strategy, per-symbol path:

1. Add or update a strategy folder and manifest.
2. Run a research campaign across the intended symbol universe.
3. Append every promoted and rejected result to the experiment ledger.
4. Move only strong candidates from `research` to `candidate`.
5. Validate Pine and exported TradingView Strategy Tester trades.
6. Run `npm run validate-backtest <csv...>` to create scoped approval records.
7. Promote exactly one strategy version and symbol set to `demo` or `live`.
8. Keep execution commands gated by explicit current user instruction and runtime checks.

No campaign result or local backtest score is execution approval.

## Host Neutrality

The new domain modules are plain Node modules. They do not depend on Codex-specific
MCP paths or agent names. Codex, Claude Code, and OpenClaw can all read the same
strategy manifests, campaign plans, ledger records, and scoped approval records.

