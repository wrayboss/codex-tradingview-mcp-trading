# Contributing

Thanks for improving this repository. Keep changes narrow, testable, and honest about trading risk.

## Development Rules

- Work on a branch, not local `main`.
- Do not commit secrets, `.env`, account data, runtime state, screenshots with account details, or trade history.
- Do not enable live trading, demo order placement, campaign behavior, or autonomous execution unless the maintainer explicitly scopes that work.
- Do not widen execution eligibility to new Deriv symbols without strategy-scoped validation.
- Keep Codex and MCP tools fail-closed when data is missing.
- Do not make profitability or adoption claims without evidence in the repo.

## Local Setup

```powershell
npm install
Copy-Item .env.example .env
```

Use placeholder values until you are doing private local dry-run validation. Never print token values in logs or issue comments.

## Required Checks

Run the checks that match your change. For normal PRs:

```powershell
npm test
npm run codex:check
npm run scan:secrets
npm run runtime:health
npm run safe-gate -- --json
git diff --check
```

`npm run safe-gate -- --json` is expected to exit blocked by default. That is a passing safety signal when it reports `allowed: false`.

## Pull Requests

Your PR should explain:

- What changed.
- Why it changed.
- Which safety gates were preserved.
- Which validation commands passed.
- Any missing local tools, missing credentials, or runtime blockers.
