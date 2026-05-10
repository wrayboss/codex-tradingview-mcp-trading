# Validation Commands

Run commands from the target repo root. Refresh status first.

## PovertyKillerEA

Root:

```bash
cd /path/to/PovertyKillerEA
git status --short --branch
```

Core checks:

```powershell
pnpm run check
pnpm test
pnpm run lint
pnpm run scan:secrets
pnpm run build
```

Local service checks:

```powershell
pnpm run check:local
pnpm run dev
pnpm run dev:stack
```

Use browser checks only after the terminal shows the actual local URL and the app is still running.

## codex-tradingview-mcp-trading

Root:

```bash
cd /path/to/codex-tradingview-mcp-trading
git status --short --branch
```

Core checks:

```powershell
npm test
npm run codex:check
npm run scan:secrets
```

Git / PR safety:

```powershell
npm run git:preflight
```

Backtest / Deriv-connected checks:

```powershell
npm run validate-backtest
npm run dry-run
```

Only run Deriv-connected checks when the user asks for runtime/trading readiness or the current task requires it. Do not treat connectivity as profitability.

Private deriv_ea bridge checks from this repo:

```powershell
npm run deriv-ea -- status
npm run deriv-ea -- doctor
npm run deriv-ea -- check
npm run deriv-ea -- quick-check
npm run deriv-ea -- backtest-dry --symbol CRASH1000
```

The bridge is allowlisted. It must not start live MT5 services, deploy EAs, place orders, close positions, or run arbitrary shell commands.

## deriv_ea

Root:

```powershell
cd C:\deriv_ea
git status --short --branch
```

Core checks:

```powershell
python scripts\checks\secrets_scan.py --all
.\task.bat precommit
.\task.bat quick-check
python -m pytest tests/ -v
```

Backtest planning check:

```powershell
.\task.bat backtest-dry -Symbol CRASH1000
```

Do not run live MT5 commands, signal-server startup, deployment scripts, or position/order commands unless Wrayboss explicitly asks in the current session and the `deriv_ea` repo gates are verified.

## Completion Rule

Before saying work is complete, fixed, clean, passing, or ready:

1. Identify the command that proves the claim.
2. Run it fresh.
3. Read the exit code and output.
4. Report exact failures or exact passing evidence.
