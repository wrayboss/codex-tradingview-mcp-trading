# Agent Control

This folder is the repo-local portable control layer for Codex work across the user's two main repositories. It is intentionally plain Markdown/YAML so it can be read, diffed, and updated without any cloud dependency.

## Primary Repositories

- Current repo root: run `git rev-parse --show-toplevel`.
- Historical Windows paths may appear in evidence/source pages as migration context. Update `repos.yaml` after cloning on a VPS.

## Operating Model

1. Treat this folder as the cross-repo index.
2. When working inside a repo, read that repo's own `AGENTS.md` first.
3. Refresh live state with `git status --short --branch` before edits, commits, PRs, cleanup, or trading checks.
4. Do not rely on remembered state when command output, files, chart state, account state, or docs can verify it.
5. Do not store API tokens, account balances, private keys, session cookies, or `.env` contents here.

## Files

- `AGENTS.md` - cross-repo instructions for Codex.
- `goals.md` - active goals, stop conditions, and backlog.
- `repos.yaml` - verified repo registry and safe command inventory.
- `update-status.ps1` - Windows status refresh helper retained from the original setup.
- `../update-status.sh` - Linux/VPS status refresh helper for the current repo.
- `runbooks/povertykillerea.md` - repo-specific operating guide.
- `runbooks/tradingview-deriv.md` - repo-specific operating guide.
- `checks/validation-commands.md` - command menu by repo and risk level.
- `checks/browser-checks.md` - built-in browser usage rules.
- `evidence/latest-status.md` - latest observed local state.

## First Rule

If a future answer depends on current repo state, verify it first. This control layer tells Codex where to look and what to protect; it does not replace fresh evidence.
