# Security Policy

## Supported Scope

This repository is a local Codex and MCP control plane for TradingView and Deriv research workflows. It is designed to fail closed around live trading and to keep secrets in local ignored files.

Security-sensitive areas include:

- Deriv credentials and account metadata.
- TradingView Desktop control through local CDP.
- MCP tool contracts and tool exposure.
- Runtime artifacts under `.env`, `state/`, `trades.csv`, and `safety-check-log*.json`.
- Live or demo execution gates.

## Reporting A Vulnerability

Open a GitHub security advisory or contact the repository owner privately. Do not open a public issue that includes tokens, account identifiers, private logs, screenshots with account data, or full runtime artifacts.

Include:

- The affected file, script, or MCP tool.
- The exact risk and the minimum reproduction steps.
- Whether the issue can expose secrets, bypass a trading gate, or place an order.
- The command output needed to reproduce the issue, with secrets redacted.

## Secrets Handling

Never commit or paste:

- `DERIV_API_TOKEN`
- API keys, account tokens, cookies, private keys, or passwords
- `.env`
- TradingView session data
- `state/`
- `trades.csv`
- `safety-check-log*.json`

Use `.env.example` for placeholders only. Run `npm run scan:secrets` before publishing a branch.

## Live Trading Boundary

Do not add, expose, or weaken live trading behavior without explicit review. The default posture is read-only research, dry-run evaluation, and fail-closed safety checks. `npm run safe-gate -- --json` must remain blocked by default unless a current explicit execution request, account state, backtest approval, risk settings, and open-position checks are all verified.
