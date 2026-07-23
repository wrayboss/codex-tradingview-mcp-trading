---
name: wrayboss-codex-tradingview
description: Use when a user asks to operate, analyze, mark up, repair, or validate Wrayboss's local TradingView Desktop through the Codex TradingView MCP on the authorized Windows VPS, including drawings, Pine Script, Strategy Tester, replay, alerts, Deriv research, Jarvis, Deriv EA reports, or CDP port 9222 failures.
compatibility: Requires Remote Desktop Commander access to the authorized Windows VPS, PowerShell 5.1+, Node.js 18+, the local TradingView Desktop CDP session, and Wrayboss's Codex repository.
metadata:
  author: wrayboss
  version: "1.0.0"
  verified-tool-count: "114"
---

# Wrayboss Codex TradingView

## Core principle

Use **Wrayboss's Codex MCP control plane and the local TradingView Desktop app only**. Prove every material result. Never substitute another repository, a browser tab, the protected Microsoft Store binary, or an upstream MCP.

A tool name is not proof that a tool worked. Discovery, execution, and visible state are separate evidence levels.

## Mandatory identity lock

| Component | Required value |
|---|---|
| Primary repository | `C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading` |
| Required origin | `https://github.com/wrayboss/codex-tradingview-mcp-trading.git` |
| Primary MCP server | `C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading\codex-mcp\server.js` |
| Full chart MCP dependency | `C:\Users\Administrator\tradingview-mcp\src\server.js` |
| TradingView application | `C:\Users\Administrator\TradingView-CDP\TradingView.exe` |
| CDP endpoint | `http://127.0.0.1:9222` |
| Expected combined registry | `114` tools for the verified revision |
| VPS runtime cache | `C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview` |

The Claude-named trading repository and the LewisWJackson repository are **not fallbacks**. They may be inspected only to diagnose history; they must never become the operating target.

## Status contract

Every final operational claim begins with exactly one status:

- `YES — EXECUTED AND VERIFIED`
- `NO — CAPABILITY UNAVAILABLE`
- `NOT VERIFIED — EVIDENCE INSUFFICIENT`
- `BLOCKED — DEPENDENCY FAILED`

Do not use “should,” “probably,” “looks done,” or “full access confirmed” without live evidence.

## Required execution route

Use Remote Desktop Commander to operate the authorized VPS. Do not claim native ChatGPT MCP attachment: this skill provides the operating playbook and verified bridge scripts; Remote Desktop Commander provides the actual remote execution channel.

Before first use, verify the runtime cache contains byte-matching copies of the packaged `scripts/` files. Read [environment-contract.md](references/environment-contract.md) for the installation and hash procedure. If package resources cannot be transferred to the VPS, report `BLOCKED`.

## Mandatory preflight

Run the runtime copy of:

```powershell
& 'C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview\scripts\verify-environment.ps1'
```

Do not perform a state-changing TradingView action unless the JSON result says:

```json
{"status":"READY","readyForMutation":true,"toolCount":114}
```

`READY` requires all of the following:

1. Exact primary repository and origin.
2. Exact Codex and external MCP server paths.
3. Dedicated local TradingView executable.
4. CDP `/json/version` response on port `9222`.
5. A local `tradingview.com/chart/` CDP target.
6. Exactly 114 combined tools and the required capability categories.
7. Successful `tv_health_check`.
8. Successful `chart_get_state` with symbol and timeframe.
9. A screenshot result whose file exists and has nonzero bytes.

`DEGRADED`, `NOT VERIFIED`, and `BLOCKED` permit diagnosis and read-only inspection only.

## Tool invocation

Use the runtime wrapper:

```powershell
& 'C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview\scripts\invoke-mcp-tool.ps1' `
  -Tool chart_get_state `
  -ArgumentsJson '{}'
```

Pass structured arguments as JSON. Never build shell commands with `Invoke-Expression`. For exact schemas and category mappings, read [tool-catalog.md](references/tool-catalog.md) and `tests/expected-tools.json`.

Prefer semantic tools in this order:

1. Exact chart, Pine, drawing, replay, alert, data, or Jarvis tool.
2. Structured UI tool when no semantic tool exists.
3. Raw mouse/keyboard tools only after element discovery and before/after screenshots.

Do not use direct filesystem edits, browser automation, or shell trading commands as substitutes for an available MCP operation.

## Evidence recipe for every operation

Record these fields in order:

1. `status`
2. `requested_action`
3. `tool`
4. `before_state`
5. `tool_result`
6. `after_state`
7. `artifact_or_entity_id`
8. `cleanup`
9. `limitations`

State changes require before and after evidence. A drawing requires an entity ID plus `draw_list` or screenshot confirmation. Removal requires the same ID to be absent afterward. A screenshot requires the returned path and a nonzero file size. Pine work requires source acknowledgement plus compile or error evidence. Strategy claims require structured or visible Strategy Tester evidence.

Read [evidence-and-honesty.md](references/evidence-and-honesty.md) before reporting completion.

## Quick reference

| User goal | Preferred tools | Minimum proof |
|---|---|---|
| Inspect chart | `chart_get_state`, `quote_get`, `data_get_ohlcv` | symbol, timeframe, returned data |
| Change chart | `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type` | state before and after |
| Add markup | `draw_shape`, `draw_list` | entity ID and listed drawing |
| Remove markup | `draw_remove_one` | removed ID absent afterward |
| Screenshot | `capture_screenshot` | path and nonzero bytes |
| Indicators | `chart_manage_indicator`, `indicator_set_inputs` | study list before and after |
| Pine | `pine_get_source`, `pine_set_source`, `pine_compile`, `pine_get_errors` | source and compile/error result |
| Strategy Tester | `data_get_strategy_results`, `data_get_trades`, `data_get_equity`, Codex backtest tools | structured metrics and blockers |
| Alerts | `alert_create`, `alert_list`, `alert_delete` | alert identifier and list state |
| Replay | `replay_start`, `replay_status`, `replay_step`, `replay_stop` | replay status before and after |
| Layout/panes/tabs | `layout_*`, `pane_*`, `tab_*` | lists and selected IDs |
| Deriv research | `deriv_active_symbols`, `deriv_research_candles`, strategy tools | returned symbol/data and research-only flag |
| Jarvis | `jarvis_*` | returned plan/report and execution boundary |
| Deriv EA reports | `deriv_ea_status`, `deriv_ea_doctor`, `deriv_ea_check`, `deriv_ea_quick_check`, `deriv_ea_backtest_dry` | read-only result and blockers |

## Reversible mutation protocol

Before any mutation:

1. Save current symbol, timeframe, studies, visible range, and relevant drawings.
2. Name temporary test artifacts with `WRAYBOSS_SKILL_TEST_<UTC timestamp>`.
3. Mutate only the requested object.
4. Verify the returned identifier and visible/listed state.
5. Remove temporary artifacts by exact identifier.
6. Re-read state and verify restoration.

Never use `draw_clear` as a cleanup shortcut. Never remove all indicators, reset layouts, close tabs, or relaunch the application merely to prove access.

## Chart-analysis standard

For multi-timeframe analysis, separate observation from inference:

- Read the requested higher-timeframe structure first.
- Read the requested entry/confirmation timeframe second.
- Use MCP-returned candles, quotes, indicators, and screenshots as evidence.
- Mark support, resistance, zones, trendlines, invalidation, and scenarios only when requested.
- Label every trade idea as analysis, dry-run research, or execution-eligible evidence. Do not promote analysis into an order instruction.

See [operator-playbooks.md](references/operator-playbooks.md) for chart, Pine, replay, alerts, backtest, morning-brief, and Jarvis sequences.

## Recovery rules

Use the least destructive recovery step first. Read [recovery-playbook.md](references/recovery-playbook.md).

1. Re-run preflight without changing processes.
2. Verify exact paths, origin, Node, dependencies, and runtime script hashes.
3. Reuse a healthy CDP session.
4. If no TradingView process is running, launch the dedicated binary with port `9222`.
5. If TradingView is running without CDP, report the disruption risk before stopping it.
6. Force-relaunch only after explicit approval.
7. Never reclone over local work or switch to another repository.

After a message-stream interruption, resume from the last recorded evidence. Do not repeat discovery, installations, or chart mutations that already succeeded.

## Financial execution boundary

“Full access” means every tool exposed by the verified 114-tool MCP registry may be considered according to its own implemented safety contract. It does not mean unlimited live order authority.

The five `deriv_ea_*` tools are read-only or dry-backtest control-plane tools. The Codex MCP does not expose an MT5 send-order tool. Do not run `npm run trade`, `npm run loop`, broker order commands, or non-MCP execution as a workaround.

For any live-money request, first inspect the exact MCP tool and repository safety contract. If no implemented MCP order tool exists, answer:

`NO — CAPABILITY UNAVAILABLE: the verified MCP does not expose live order placement.`

## Required final response

Use this compact shape:

```text
YES — EXECUTED AND VERIFIED
Action: ...
Tool: ...
Before: ...
Result: ...
After: ...
Evidence: ...
Cleanup: ...
Limitations: ...
```

For failure, replace the first line with `NO`, `NOT VERIFIED`, or `BLOCKED` and name the exact failed dependency. Never bury the verdict.

## References

- [Environment and runtime installation](references/environment-contract.md)
- [Evidence and honesty contract](references/evidence-and-honesty.md)
- [Operator playbooks](references/operator-playbooks.md)
- [Recovery playbook](references/recovery-playbook.md)
- [Tool catalog](references/tool-catalog.md)
- [Known limitations](references/known-limitations.md)
- [Live expected tool manifest](tests/expected-tools.json)
- [Capability classification](tests/capability-manifest.json)
- [Verification report](tests/verification-report.md)
