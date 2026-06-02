# Codex For OSS Application Notes

## Recommended Repository URL

Use:

```text
https://github.com/wrayboss/codex-tradingview-mcp-trading
```

## Project Summary

`codex-tradingview-mcp-trading` provides a local Codex/MCP control plane for TradingView and Deriv research workflows. It focuses on read-only chart and account inspection, strategy dry-runs, MCP tool contracts, secret scanning, and fail-closed validation gates.

## Why It Fits Codex For OSS

- It shows Codex operating as a local engineering and trading-research assistant with explicit safety boundaries.
- It exposes MCP tools that separate read-only inspection, dry-run analysis, and execution-gated workflows.
- It includes validation scripts that keep missing approval, account, or risk state blocked by default.
- It documents repo-local setup, contribution rules, and security handling.

## Safety And Privacy Notes

- No real credentials should be committed.
- `.env` and runtime artifacts are ignored.
- The Codex bridge must not place live trades by default.
- Public claims should avoid guaranteed returns, adoption numbers, or production-readiness claims without evidence.

## Submission Readiness

Use this repo for the OpenAI Codex-for-OSS application only after:

- `npm test` passes.
- `npm run codex:check` passes.
- `npm run scan:secrets` passes.
- `npm run runtime:health` passes.
- `npm run safe-gate -- --json` confirms the default fail-closed state.
- `git diff --check` passes.
- A full-history secret scan passes.
- The maintainer is comfortable making the repo public.
