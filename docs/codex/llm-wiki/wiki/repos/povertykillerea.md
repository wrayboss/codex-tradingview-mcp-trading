# PovertyKillerEA

Repo path: `C:\Users\NewAdmin\Documents\GitHub\PovertyKillerEA`

## Working Rule

Feature work should use an isolated worktree or branch and PR delivery. Do not implement feature work on local `main`.

## Central Pointer Status

Merged PR: https://github.com/wrayboss/PovertyKillerEA/pull/327

`AGENTS.md` now points Codex to the central control layer and LLM wiki. `CLAUDE.md` was also updated during review so the repo's mirror note stays consistent.

## High-Risk Boundaries

- Token and auth flow.
- Execution hot path.
- Auto-mode behavior.
- Worker architecture.
- Collector write hardening.
- ChatGPT app command/execution capability unless explicitly security-scoped.

## Verification

Read the repo-local `AGENTS.md` first, then refresh with:

```powershell
git status --short --branch
```

Use the central runbook for command menus:

`docs\codex\agent-control\runbooks\povertykillerea.md`
