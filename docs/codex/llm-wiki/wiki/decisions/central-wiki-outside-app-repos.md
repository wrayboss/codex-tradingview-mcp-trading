# Decision: Keep Central Wiki Outside App Repos

## Decision

Keep the full `agent-control/` and `llm-wiki/` folders outside `PovertyKillerEA` and `claude-tradingview-mcp-trading`.

Add only tiny repo-local pointers in each repo's `AGENTS.md`.

## Reasoning

- `PovertyKillerEA` already has a large `AGENTS.md`.
- The wiki is shared across both repos, so duplicating it inside each app repo would create drift.
- Repo-local pointers make the central rules discoverable when Codex starts directly inside a repo.
- Small docs-only PRs keep `main` reviewable and avoid unrelated app changes.

## Current Central Paths

- `docs\codex\agent-control\AGENTS.md`
- `docs\codex\llm-wiki\AGENTS.md`
