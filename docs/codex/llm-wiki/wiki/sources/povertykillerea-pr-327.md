# Source: PovertyKillerEA PR 327

URL: https://github.com/wrayboss/PovertyKillerEA/pull/327

## Summary

Merged a docs-only pointer from `PovertyKillerEA` to the central Codex control layer and local LLM wiki.

## Merge Evidence

- State: merged
- Merge commit: `6a77777ea4677aa35f780623a2565105aa738f86`
- Merged at: `2026-05-09T06:05:02Z`

## Review Note

Reviewer patch added the matching Codex cross-repo note to `CLAUDE.md` because `AGENTS.md` says that `CLAUDE.md` mirrors the agent-facing subset of repo rules.

## Validation

- `git diff --check`
- `pnpm run scan:secrets`
- GitHub Vercel checks reported success before merge.
