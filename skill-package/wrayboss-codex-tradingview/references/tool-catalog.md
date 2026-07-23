# Tool catalog

The verified combined registry contains 114 unique tool names: 34 Codex control-plane tools plus 80 additional non-duplicate tools proxied from the full local TradingView MCP.

`tests/expected-tools.json` is the authoritative exact-name manifest. Retrieve live schemas with:

```powershell
node 'C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview\scripts\mcp-client.mjs' list
```

Do not guess arguments from this grouped reference. Use the live schema.

## Codex control plane

### Local TradingView workflows

- `tv_health_check`
- `tv_get_state`
- `tv_list_indicators`
- `tv_add_indicator`
- `tv_remove_indicator`
- `tv_clean_chart_studies`
- `tv_set_chart`
- `tv_research_set_chart`
- `tv_inject_pine_source`
- `tv_attach_saved_pine_strategy`
- `tv_read_strategy_tester_summary`
- `tv_backtest_workflow_check`
- `tv_get_pine_errors`
- `tv_capture_screenshot`

### Deriv data and strategy research

- `deriv_account_summary`
- `deriv_active_symbols`
- `deriv_candles`
- `deriv_research_candles`
- `strategy_evaluate_dry_run`
- `strategy_autonomy_status`
- `strategy_autonomy_plan`
- `strategy_candidate_backtest`
- `strategy_research_matrix`

### Deriv EA read-only bridge

- `deriv_ea_status`
- `deriv_ea_doctor`
- `deriv_ea_check`
- `deriv_ea_quick_check`
- `deriv_ea_backtest_dry`

These are status, validation, and dry-backtest tools. They are not order-placement tools.

### Jarvis

- `jarvis_command_center`
- `jarvis_analyze_chart`
- `jarvis_scan_watchlist`
- `jarvis_trade_desk_check`
- `jarvis_morning_brief`
- `jarvis_strategy_compare`

## Full chart API categories

### Chart and symbol

`chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_manage_indicator`, visible-range tools, date scrolling, `symbol_info`, and `symbol_search`.

### Pine

Source read/write, compile, errors, console, smart compile, new/open/list/save, analysis, and checks.

### Market and strategy data

OHLCV, indicator values, strategy results, trades, equity, quotes, depth, Pine lines, labels, tables, boxes, and study values.

### Drawings

- `draw_shape`
- `draw_list`
- `draw_clear`
- `draw_remove_one`
- `draw_get_properties`

Use `draw_remove_one` for exact cleanup. `draw_clear` is destructive and is never an access test.

### Screenshots

`capture_screenshot` supports full, chart, and Strategy Tester regions according to the live schema.

### Alerts

Create, list, and delete.

### Replay

Start, step, autoplay, stop, simulated replay trade, and status.

### Indicators and watchlists

Indicator inputs and visibility plus watchlist read/add.

### UI, layouts, panes, and tabs

Semantic clicks/panels/fullscreen, keyboard/text/hover/scroll/mouse, element discovery/evaluation, layout switching, pane control, and tab control.

### Sessions and batch operations

`batch_run`, `morning_brief`, `session_save`, and `session_get`.

## Selection rules

1. Choose the narrowest semantic tool that directly matches the request.
2. Read the live schema before the first call in a session.
3. Use UI primitives only when a semantic tool is absent or verified broken.
4. Do not invoke destructive tools to test access.
5. Preserve MCP safety fields and research/execution distinctions in the response.
