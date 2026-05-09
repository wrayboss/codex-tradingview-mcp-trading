# PovertyKillerEA Runbook

Repo path: `C:\Users\NewAdmin\Documents\GitHub\PovertyKillerEA`

## Start Here

1. Read `C:\Users\NewAdmin\Documents\GitHub\PovertyKillerEA\AGENTS.md`.
2. Run `git status --short --branch`.
3. Confirm whether the task is read-only, implementation, review, cleanup, or PR maintenance.
4. For implementation, create/use an isolated worktree or feature branch from `origin/main`. Do not work on local `main`.

## Current Observed State

Observed on local machine at `2026-05-04 21:29:25 -05:00`:

```text
## main...origin/main
?? ml/__pycache__/
?? server/__pycache__/
?? server/auto_engine/__pycache__/
?? server/inference/__pycache__/
?? server/tests/__pycache__/
```

Treat this as a snapshot. Refresh before acting.

## High-Risk Areas

Do not touch these unless the task explicitly scopes them:

- Token modal, token storage, and Deriv auth flow.
- `executeTrade`, `buyContract`, `sellContract`, `proposalCacheRef`, and `sendRequest`.
- Auto-mode timing and gate behavior.
- `decisionEngine.ts` agreement between display and auto-mode gate.
- Worker architecture around `researchWorker.ts` and `useResearchEngine.ts`.
- Collector and local inference write-token hardening.
- ChatGPT app command/execution bridge. Existing ChatGPT app behavior is read-only unless explicitly changed by a security-scoped task.

## Work Modes

Read-only audit:

- Work in the current checkout after status verification.
- Do not rewrite files or cleanup artifacts unless asked.
- Report prioritized findings and the checks run.

Implementation:

- Start from `origin/main`.
- Use a separate worktree under `C:\Users\NewAdmin\.config\superpowers\worktrees\PovertyKillerEA\` or another explicit feature worktree path.
- Keep the PR one-purpose.
- Push a branch and open a PR into `main`.
- Do not merge the PR.

Cleanup:

- Verify exact paths before deleting anything.
- `__pycache__` folders are rebuildable, but delete them only when they block the task or the user asks.
- Never delete `.env`, local DB files, logs, exported evidence, or runtime state casually.

## Validation Menu

Use the smallest set that proves the requested change:

```powershell
git status --short --branch
pnpm run check
pnpm test
pnpm run lint
pnpm run scan:secrets
pnpm run build
pnpm run check:local
```

For targeted frontend tests, prefer the repo's existing Vitest patterns. Prior local evidence showed `pnpm exec vitest --run --pool=forks` as a stable targeted path, but verify current dependency state first.

## Browser Checks

Use Codex's built-in browser for localhost pages. Start the app only when needed, then inspect the actual served URL from terminal output instead of assuming the port.

Likely commands:

```powershell
pnpm run dev
pnpm run dev:stack
pnpm run preview
```

Verify the actual URL and backend health before reporting UI behavior.
