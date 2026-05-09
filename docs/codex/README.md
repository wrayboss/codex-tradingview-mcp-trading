# Codex Portable Control Files

This folder packages the shared Codex control layer and Karpathy-style LLM wiki inside the repository so a VPS clone can use them without depending on the old Windows Codex workspace.

## Start Here

Read these files in order:

1. `AGENTS.md` at the repository root.
2. `docs/codex/agent-control/AGENTS.md`.
3. `docs/codex/llm-wiki/AGENTS.md`.
4. `docs/codex/llm-wiki/wiki/synthesis/start-here.md`.

## Contents

- `agent-control/` - cross-repo operating rules, runbooks, validation commands, browser checks, and status refresh script.
- `llm-wiki/` - maintained Markdown wiki based on Karpathy's LLM Wiki pattern.
- `VPS_MIGRATION.md` - migration checklist for bringing this setup up on a VPS.
- `update-status.sh` - Linux-friendly status refresh helper.

## Important Boundary

These files supplement the repo-local rules. They do not override token, execution, auto-mode, symbol-scope, strategy, or validation-gate boundaries in the root `AGENTS.md`.
