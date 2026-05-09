# OpenClaw Task Templates

Use these templates for repeatable repo work. Replace bracketed fields before running agents.

## Bugfix

```text
Goal: Fix [bug] in claude-tradingview-mcp-trading.
Repo: C:\Users\Administrator\Documents\GitHub\claude-tradingview-mcp-trading
Rules:
- Inspect git status first.
- Reproduce the bug with a failing test or exact command.
- Make the smallest fix.
- Run npm test and npm run scan:secrets.
- Report changed files, verification, and remaining risk.
```

## Strategy Research

```text
Goal: Research [strategy idea] for V75/V50 without changing execution scope.
Rules:
- Research is read-only unless Wrayboss explicitly asks to promote.
- Do not edit .env, rules.json, or state/backtest-approved.json.
- Use research candles, local backtest scoring, and TradingView evidence.
- Mark Crash/Boom or non-V75/V50 symbols research-only.
- Stop before live/demo execution.
```

## Code Review

```text
Goal: Review [branch/diff] for correctness, safety, and missing tests.
Rules:
- Prioritize bugs, regressions, unsafe trading behavior, secret leaks, and test gaps.
- Cite file paths and exact checks.
- Do not rewrite code unless Wrayboss asks for fixes.
```

## Test Repair

```text
Goal: Fix failing tests from [command output].
Rules:
- Read the failure output first.
- Identify the failing contract.
- Do not weaken tests to pass.
- Fix code or fixtures, then run npm test.
```

## TradingView Backtest Prep

```text
Goal: Prepare TradingView backtest evidence for [symbol/strategy].
Rules:
- Confirm chart symbol/timeframe.
- Confirm Pine compiles with no visible errors.
- Export Strategy Tester List of Trades CSV.
- Run npm run validate-backtest <csv...>.
- Report gates passed/failed and do not infer approval without state/backtest-approved.json.
```

## Claude Opus Plan To Codex Implementation

```text
Goal: Use Claude Code Opus 4.7, or the strongest available Opus planning model, for a deep plan, then Codex for implementation.
Planning command:
claude -p "[deep planning prompt]" --model opus --permission-mode plan

Implementation command:
codex exec --cd C:\Users\Administrator\Documents\GitHub\claude-tradingview-mcp-trading --model gpt-5.4-mini --sandbox danger-full-access "[approved plan + implementation request]"

Rules:
- Claude Code Opus 4.7, or the strongest available Opus planning model, plans major architecture, breakthroughs, and deep repo analysis.
- Codex implements the approved plan.
- Verify both agent output and repo changes before reporting completion.
```
