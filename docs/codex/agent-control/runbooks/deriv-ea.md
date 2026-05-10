# deriv_ea Runbook

`deriv_ea` is the separate private MT5 Boom/Crash EA, data, ML, and backtest engine. It is not vendored into `codex-tradingview-mcp-trading`.

Canonical local path:

```powershell
C:\deriv_ea
```

Canonical remote:

```powershell
https://github.com/wrayboss/deriv_ea.git
```

## Start Here

From `codex-tradingview-mcp-trading`, inspect the engine through the read-only/check-only bridge:

```powershell
npm run deriv-ea -- status
npm run deriv-ea -- doctor
```

If `C:\deriv_ea` is missing, stop and report that blocker. Do not substitute another path.

## Safe Bridge Commands

```powershell
npm run deriv-ea -- status
npm run deriv-ea -- doctor
npm run deriv-ea -- check
npm run deriv-ea -- quick-check
npm run deriv-ea -- backtest-dry --symbol CRASH1000
```

`check` is exact:

```powershell
python scripts\checks\secrets_scan.py --all
.\task.bat precommit
```

`quick-check` is intentionally separate because it is heavier.

Allowed `backtest-dry` symbols are:

```text
BOOM300N, BOOM500, BOOM1000, CRASH300N, CRASH500, CRASH1000
```

## Required Files

`deriv_ea doctor` verifies:

```text
AGENTS.md
docs/skills.md
task.bat
scripts/task.ps1
pipeline_contract.py
strategy_spec.json
pipeline/scripts/paths.json
```

Known follow-up: `AGENTS.md` currently tells agents to read `AGENTS/skills.md`, but the checked-in guide is `docs/skills.md`. The bridge surfaces this as a warning.

## Hard Boundaries

- Do not run live MT5 actions through the Codex bridge.
- Do not expose `mt5_send_order`, `mt5_close_all`, signal-server startup, deployment wrappers, or arbitrary shell commands.
- Do not change MQL5 trading logic unless Wrayboss explicitly scopes that work.
- Do not print or commit secrets from `config.ini`, `.env`, local DB config, API tokens, or account files.
- Do not claim model, backtest, or EA validity without command output or report evidence.

## Role In The Umbrella

`codex-tradingview-mcp-trading` is the control plane for Jarvis, Codex, TradingView, Pine, research ranking, and promotion gates.

`deriv_ea` is the MT5 Boom/Crash execution and validation engine. Use it for MT5-specific data, feature engineering, MQL5 EA validation, deterministic backtest planning, and ML/ONNX pipeline checks.
