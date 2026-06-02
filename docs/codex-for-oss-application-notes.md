# Codex For OSS Application Notes

## Recommended Application Repo URL

Use:

```text
https://github.com/wrayboss/codex-tradingview-mcp-trading
```

## Companion Repo URL

```text
https://github.com/wrayboss/trading-jarvis-codex-plugin
```

## Maintainer Role Statement

I maintain the repository, safety gates, MCP contracts, validation scripts, and OSS readiness materials. I am preparing it as a local-first Codex/MCP research control plane with dry-run defaults and explicit live-trading boundaries.

## Project Summary

Safety-gated Codex/MCP control plane for local TradingView/Deriv research workflows, with dry-run defaults, read-only bridge contracts, secret scanning, validation gates, runtime health checks, and fail-closed execution safety.

## API Credit Usage Answer

OpenAI API credits would support local Codex engineering, MCP contract testing, safety-gate hardening, documentation, and dry-run research workflows. Credits would not be used to execute live trades, bypass approvals, or make unsupported profitability claims.

## Evidence Of Active Maintenance

- PR #5 prepared OSS readiness files, issue templates, PR template, license, security policy, contribution guide, and package metadata updates.
- Runtime checks include tests, Codex MCP self-test, repo-local secret scan, runtime health, safe-gate JSON output, npm audit, whitespace checks, and full-history gitleaks.
- Historical secret remediation removed `docs/exchanges/coinbase.md` from all reachable branch history before public release.

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
- Safe-gate behavior is expected to fail closed unless explicit approval, account, and risk state are present.
- Historical Coinbase key-like material was treated as compromised and removed from branch history. Any matching external key must be revoked or rotated before public release.

## Validation Evidence

Use the final release report as the source of truth for current pass/fail status. Required checks:

- `npm test`
- `npm run codex:check`
- `npm run scan:secrets`
- `npm run runtime:health`
- `npm run safe-gate -- --json`
- `npm audit --audit-level=moderate`
- `git diff --check`
- `gitleaks detect --source . --no-git=false`

## Known Limitations

- This is a local research and control-plane project, not a guarantee of trading profitability.
- Live trading remains disabled by default and requires explicit operator-controlled approval outside the OSS application.
- The project should be evaluated on safety posture, MCP/Codex integration quality, and maintainability, not adoption metrics.
- No user, star, download, revenue, or profitability claims are made without evidence.

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
