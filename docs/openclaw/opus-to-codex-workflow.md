# Claude Opus To Codex Workflow

Wrayboss's preferred major-workflow pattern:

1. Use Claude Code Opus 4.7, or the strongest available Claude Code Opus planning model, for serious planning, breakthroughs, and deep repo understanding.
2. Review the plan against repo safety rules.
3. Use Codex to implement the approved plan.
4. Verify with local tests and safety checks.
5. Commit only reviewed, verified changes.

## When To Use Claude Opus First

- Large strategy changes.
- Multi-file architecture changes.
- Deep repo archaeology.
- Ambiguous failures requiring broad system reasoning.
- Planning before a major trading workflow or integration.

## When To Skip Opus

- Small docs edits.
- Simple one-line fixes.
- Routine test runs.
- Status checks.
- Purely mechanical updates.

## Default Prompt For Opus

```text
You are doing senior architecture planning for Wrayboss in claude-tradingview-mcp-trading.
Read the repo rules, preserve trading safety boundaries, and produce an implementation plan for Codex.
Do not modify files. Focus on architecture, risks, exact files, tests, and verification.
```

Command pattern:

```powershell
claude -p "[deep planning prompt]" --model opus --permission-mode plan
```

## Default Prompt For Codex

```text
Implement the approved Claude Opus plan in claude-tradingview-mcp-trading.
Keep changes scoped, preserve trading safety rules, run npm test and npm run scan:secrets, and report exact changed files.
```

Command pattern:

```powershell
codex exec --cd C:\Users\Administrator\Documents\GitHub\claude-tradingview-mcp-trading --model gpt-5.4-mini --sandbox danger-full-access "[approved plan + implementation request]"
```
