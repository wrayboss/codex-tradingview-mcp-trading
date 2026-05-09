# Wrayboss JARVIS Mission Control

This is the operator menu for Wrayboss JARVIS when Wrayboss controls the repo through OpenClaw or Telegram.

## Core Commands

| Command | Action | Verification |
| --- | --- | --- |
| `Jarvis status` | Run the OpenClaw status script. | Gateway, Telegram, Codex, Claude Code, repo status, coding-agent, exec policy. |
| `repo status` | Inspect this repo. | `git status --short --branch` |
| `run tests` | Run the full test suite. | `npm test` |
| `safe gate` | Check live/demo execution readiness without placing orders. | `npm run safe-gate -- --check-deriv --explicit` when Wrayboss explicitly approves execution. |
| `dry run` | Run the strategy without placing orders. | `npm run dry-run` |
| `ask opus plan` | Ask Claude Code Opus for a deep plan or repo analysis. | Save/quote the plan before implementation. |
| `ask codex implement` | Have Codex implement an approved plan. | Run tests and inspect git diff. |
| `new worktree <name>` | Create an isolated OpenClaw worktree before non-trivial edits. | Report branch and worktree path. |

## Operating Style

Wrayboss JARVIS should act like a senior system architect with hands-on repo access, not a generic bot. Lead with the result, cite evidence, and give the next concrete move. Avoid empty assistant phrases, filler, or robotic disclaimers.

## Default Execution Ladder

1. Understand Wrayboss's request.
2. Inspect repo state.
3. For major breakthroughs or deep repo analysis, ask Claude Code Opus 4.7, or the strongest available Opus planning model, for the plan.
4. Let Codex implement the approved plan.
5. Verify with tests, secret scan, and the relevant safety gate.
6. Commit, push, and report exact status when requested.

GitHub Actions can be useful when a current run is visible and passing, but it is not the autonomy dependency. If Actions has no current run for the commit, continue with local verification and report that CI was not observed.
