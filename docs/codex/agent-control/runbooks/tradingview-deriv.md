# Codex TradingView / Deriv Runbook

Repo path: current clone root. Verify with `git rev-parse --show-toplevel`.

## Start Here

1. Read the repo-local `AGENTS.md`.
2. Run `git status --short --branch`.
3. Confirm whether the task is read-only, implementation, review, chart work, backtest validation, or live/demo trading.
4. Do not run live/demo execution unless the user explicitly asks in the current conversation and the repo gates are verified.

## Current Observed State

Historical Windows snapshot from `2026-05-04 21:29:25 -05:00`:

```text
## main...origin/main
```

No untracked preview lines were returned by `git status --short --branch`.

Treat this as a snapshot. Refresh before acting.

## High-Risk Areas

- Never print or commit `DERIV_API_TOKEN`.
- Keep `.env` local only.
- Do not widen live execution to Crash/Boom/Jump/etc. without explicit strategy-scoped promotion.
- Keep Codex-side tooling separate from Claude Code MCP/config.
- Do not modify live execution, loop behavior, or strategy boundaries unless explicitly scoped.
- Treat `state/backtest-approved.json` as a hard live-trading gate when present in the workflow.

## Work Modes

Read-only audit:

- Inspect files and generated artifacts without rewriting them.
- Report prioritized findings and checks run.

Implementation:

- Prefer a feature branch or worktree for risky/multi-file changes.
- Keep runtime strategy behavior unchanged unless the task explicitly asks for strategy changes.
- Update config, docs, tests, and sample artifacts together when a safety constraint changes.

Chart or TradingView work:

- Verify the CDP endpoint before chart actions.
- Use Codex-side bridge tools when available.
- Keep chart attachment/compiler success separate from strategy performance claims.

Trading or Deriv-connected checks:

- `npm run dry-run` is a safe smoke check only when the user wants Deriv-connected runtime health.
- A `No signal` result proves runtime connectivity/health, not profitability.
- Do not run `npm run trade`, `npm start`, or loop execution as a live action unless explicitly asked and gates are verified.

## Validation Menu

Use the smallest set that proves the requested change:

```powershell
git status --short --branch
npm test
npm run codex:check
npm run git:preflight
npm run validate-backtest
npm run scan:secrets
npm run dry-run
```

`npm run git:preflight` and `npm run validate-backtest` can fail because of local environment or missing backtest artifacts. Separate expected environment-state failures from code regressions.

## deriv_ea Bridge

Use `deriv_ea` as the separate private MT5 Boom/Crash engine. Do not copy it into this repo.

From this repo, use only the allowlisted bridge commands:

```powershell
npm run deriv-ea -- status
npm run deriv-ea -- doctor
npm run deriv-ea -- check
npm run deriv-ea -- quick-check
npm run deriv-ea -- backtest-dry --symbol CRASH1000
```

The bridge fails closed when `C:\deriv_ea` is missing and does not expose live MT5 actions.

## Browser / Chart Checks

Use Codex's built-in browser for local dashboards and localhost targets. For TradingView chart control, prefer the existing Codex bridge and verify chart state through tool output before claiming a chart action worked.
