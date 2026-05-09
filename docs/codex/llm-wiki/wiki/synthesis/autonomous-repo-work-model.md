# Autonomous Repo Work Model

## Model

Use a layered operating model:

1. Current user request.
2. Repo-local `AGENTS.md`.
3. Central `agent-control/`.
4. Central `llm-wiki/`.
5. Memory, treated as potentially stale until verified.

## Direct Repo Sessions

When Codex starts directly in either main repo:

1. Read the local `AGENTS.md`.
2. Follow its pointer to the central control layer and wiki when the task is cross-repo, autonomous, browser-based, research-heavy, or long-running.
3. Refresh live state before edits or claims.

## Evidence Standard

No conclusion about current branch, worktree cleanliness, runtime readiness, chart state, account state, or docs currency should be made without current evidence.
