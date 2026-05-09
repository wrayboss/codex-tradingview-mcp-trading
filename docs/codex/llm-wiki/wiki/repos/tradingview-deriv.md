# TradingView / Deriv Repo

Repo path: current `claude-tradingview-mcp-trading` clone. Verify with `git rev-parse --show-toplevel`.

## Working Rule

Prefer isolated branches or worktrees for risky or multi-file changes. Keep Codex-side tooling separate from Claude Code MCP/config.

## Central Pointer Status

Merged PR: https://github.com/wrayboss/claude-tradingview-mcp-trading/pull/21

`AGENTS.md` now points Codex to the central control layer and LLM wiki.

## Recent Reviewed PR

Merged PR: https://github.com/wrayboss/claude-tradingview-mcp-trading/pull/20

PR #20 hardens MCP screenshot output paths. Review patch removed unrelated lockfile drift before merge.

## High-Risk Boundaries

- Never print or commit `DERIV_API_TOKEN`.
- Keep `.env` local only.
- Do not introduce Crash/Boom symbols unless explicitly scoped.
- Do not run live/demo execution unless the user explicitly asks in the current conversation and gates are verified.
- Do not treat dry-run connectivity as profitability.

## Verification

Read the repo-local `AGENTS.md` first, then refresh with:

```powershell
git status --short --branch
```

Use the central runbook for command menus:

`docs\codex\agent-control\runbooks\tradingview-deriv.md`
