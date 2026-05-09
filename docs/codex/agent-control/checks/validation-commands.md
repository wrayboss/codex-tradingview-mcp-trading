# Validation Commands

Run commands from the repo root shown in each section. Refresh status first.

## PovertyKillerEA

Root:

```powershell
cd C:\Users\NewAdmin\Documents\GitHub\PovertyKillerEA
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

## claude-tradingview-mcp-trading

Root:

```powershell
cd C:\Users\NewAdmin\claude-tradingview-mcp-trading
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

## Completion Rule

Before saying work is complete, fixed, clean, passing, or ready:

1. Identify the command that proves the claim.
2. Run it fresh.
3. Read the exit code and output.
4. Report exact failures or exact passing evidence.
