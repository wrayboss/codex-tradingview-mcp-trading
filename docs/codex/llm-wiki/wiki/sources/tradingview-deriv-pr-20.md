# Source: TradingView / Deriv PR 20

URL: https://github.com/wrayboss/claude-tradingview-mcp-trading/pull/20

## Summary

Reviewed and merged screenshot path hardening for the Codex MCP bridge. The change constrains screenshot outputs to the repository screenshot directory and rejects absolute paths and parent-directory traversal.

## Merge Evidence

- State: merged
- Merge commit: `e56479c686a8337b6f69737c062e957b147a9dfb`
- Merged at: `2026-05-09T06:15:53Z`

## Reviewer Patch

Removed unrelated `package-lock.json` transitive dependency drift from the PR before merge. Final PR diff was scoped to:

- `codex-mcp/tools.js`
- `tests/run-tests.js`

## Validation

- `npm test` -> `482 passed, 0 failed`
- `npm run codex:check` -> `ok: true`, `toolCount: 107`
- `npm run scan:secrets` -> `Secret scan passed: 88 tracked text files checked.`
- `npm run git:preflight` -> branch wiring safe for push/PR work.
