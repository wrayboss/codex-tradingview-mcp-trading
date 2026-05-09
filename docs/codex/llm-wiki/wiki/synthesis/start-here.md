# Start Here

Use this page at the start of serious Codex work in this repo or on the VPS.

## Read Order

1. Read the user's latest request.
2. Read the active repo's local `AGENTS.md`.
3. Read `docs/codex/agent-control/AGENTS.md`.
4. Read `docs/codex/llm-wiki/AGENTS.md` when the task is research-heavy, cross-repo, autonomous, browser-based, or long-running.
5. Refresh status with `docs/codex/update-status.sh` on Linux/VPS, or `docs/codex/agent-control/update-status.ps1` on Windows, when current branch, open PRs, or dirty state matters.

## Main Repos

- Current repo root: run `git rev-parse --show-toplevel`.
- Historical Windows paths are preserved in some wiki source/evidence pages only as migration context.

## Current Operating Model

- Local `main` is not the place for feature work.
- Use isolated worktrees or branches for implementation and PR work.
- Keep repo-local safety boundaries authoritative.
- Use the central wiki for accumulated context, not as a substitute for live verification.

## Fast Commands

Refresh the local evidence snapshot:

```bash
bash docs/codex/update-status.sh
```

Windows fallback:

```powershell
powershell -ExecutionPolicy Bypass -File docs\codex\agent-control\update-status.ps1 -SkipFetch
```
