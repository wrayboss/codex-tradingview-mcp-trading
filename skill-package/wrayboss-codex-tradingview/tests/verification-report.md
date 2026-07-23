# Wrayboss Codex TradingView capability verification

- Status: **YES - EXECUTED AND VERIFIED**
- Tested at UTC: 2026-07-23T19:35:38.3881423Z
- Total checks: 25
- Failed checks: 0

| Check | Classification | Detail |
|---|---|---|
| environment_preflight | FULLY EXERCISED | Exact identity, CDP, chart, registry, and screenshot checks passed. |
| chart_get_state | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| quote_get | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| draw_list | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| pine_get_errors | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| replay_status | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| alert_list | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| watchlist_get | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| jarvis_morning_brief | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| deriv_ea_status | READ-ONLY EXERCISED | Tool returned a non-error MCP result. |
| invalid_tool_failure_path | FULLY EXERCISED | Unknown MCP tools fail closed. |
| invalid_cdp_failure_path | FULLY EXERCISED | Dead CDP endpoint blocks mutation. |
| reversible_markup | FULLY EXERCISED | One text drawing was created, listed, removed by exact ID, and confirmed absent. |
| pine_compile | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| pine_set_source | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| alert_create | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| alert_delete | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| replay_start | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| replay_step | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| replay_stop | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| ui_evaluate | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| layout_switch | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| pane_set_layout | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| tab_new | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |
| tab_close | DISCOVERY-ONLY | Present in the verified 114-tool manifest; not mutated during release testing. |

Fresh-agent behavioral pressure testing was blocked by the local Codex CLI usage limit and is NOT VERIFIED.
