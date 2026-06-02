# OSS Readiness

## Repository Positioning

`codex-tradingview-mcp-trading` is a safety-gated Codex and MCP control plane for local TradingView and Deriv research workflows. It is built for local operator use, dry-run evaluation, read-only bridge contracts, secret scanning, validation gates, and fail-closed safety checks.

This repository is not a promise of trading profitability and not an invitation to bypass exchange, broker, or account controls. Past performance does not guarantee future performance. Every execution path should stay on its Ps and Qs: verify account state, risk, approval files, and open positions before any non-dry-run order is considered.

## Current OSS Files

- `LICENSE`: MIT.
- `README.md`: repo purpose, setup, commands, validation, runtime safety, and strategy boundaries.
- `SECURITY.md`: vulnerability reporting, secrets handling, and live trading boundary.
- `CONTRIBUTING.md`: development rules and required checks.
- `CODE_OF_CONDUCT.md`: contributor conduct and safety expectations.
- `.github/ISSUE_TEMPLATE/bug_report.md`: reproducible bug template with secret handling.
- `.github/ISSUE_TEMPLATE/feature_request.md`: scoped feature template.
- `.github/PULL_REQUEST_TEMPLATE.md`: PR safety and validation checklist.
- `.env.example`: placeholder-only Deriv environment template.
- `.gitignore`: excludes local credentials and runtime artifacts.

## Safety Defaults

- Dry-run and research workflows are preferred.
- `npm run safe-gate -- --json` fails closed by default.
- Runtime health is read-only.
- Secret scanning checks tracked files for tokens and runtime artifacts.
- Live trading through the Codex MCP bridge is intentionally disabled by default.
- Research-only symbols do not become execution-eligible without explicit strategy promotion and validation.

## Public Readiness Checklist

- [x] Placeholder-only `.env.example`.
- [x] MIT license added.
- [x] Security, contribution, conduct, issue, and PR templates added.
- [x] Repo-local secret scan available with `npm run scan:secrets`.
- [x] CI workflows already run tests, Codex MCP self-test, safe-gate default block, and secret scan.
- [x] Historical `docs/exchanges/coinbase.md` private-key finding removed from reachable branch history.
- [x] Full-history secret scan passed after history remediation in a fresh remote clone.
- [x] Public claims avoid unsupported profitability, adoption, user, star, download, or revenue claims.

## Public Readiness Decision

`PUBLIC_READY` should be `YES` only after current tests pass, repo-local secret scan passes, full-history secret scan passes, and the maintainer accepts that the repo history and docs are safe to expose.
