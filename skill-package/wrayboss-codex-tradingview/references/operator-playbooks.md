# Operator playbooks

Use `$runtime` in all examples:

```powershell
$runtime = 'C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview'
$invoke = Join-Path $runtime 'scripts\invoke-mcp-tool.ps1'
```

## Start every workflow

```powershell
$preflight = & (Join-Path $runtime 'scripts\verify-environment.ps1') | ConvertFrom-Json
if ($preflight.status -ne 'READY' -or -not $preflight.readyForMutation) {
    throw "Preflight is $($preflight.status); mutation is blocked."
}
```

For read-only diagnosis, preserve the preflight JSON even when it is not `READY`.

## Read and analyze the current chart

1. Call `chart_get_state`.
2. Call `quote_get` for the current symbol.
3. Use `data_get_ohlcv` for each requested timeframe.
4. Read indicators or studies only when relevant.
5. Capture a chart screenshot.
6. Separate observed data from analytical inference.

```powershell
& $invoke -Tool chart_get_state -ArgumentsJson '{}'
& $invoke -Tool quote_get -ArgumentsJson '{}'
& $invoke -Tool capture_screenshot -ArgumentsJson '{"region":"chart","filename":"analysis-evidence"}'
```

Do not change symbol or timeframe merely to inspect them. When multi-timeframe changes are required, save the original state and restore it afterward unless the user requests the final chart remain changed.

## Change symbol or timeframe

```powershell
$before = & $invoke -Tool chart_get_state -ArgumentsJson '{}' | ConvertFrom-Json
& $invoke -Tool chart_set_symbol -ArgumentsJson '{"symbol":"DERIV:VOLATILITY_75_INDEX"}'
& $invoke -Tool chart_set_timeframe -ArgumentsJson '{"timeframe":"60"}'
$after = & $invoke -Tool chart_get_state -ArgumentsJson '{}' | ConvertFrom-Json
```

Verify `after.result.symbol` and `after.result.resolution`. Restore `before` when the change was temporary.

## Create and remove one verified drawing

Use a unique label and an exact entity ID. Never use `draw_clear` for testing.

```powershell
$quote = & $invoke -Tool quote_get -ArgumentsJson '{}' | ConvertFrom-Json
$point = [ordered]@{
    time = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    price = [double]$quote.result.last
}
$args = [ordered]@{
    shape = 'text'
    point = $point
    text = "WRAYBOSS_SKILL_TEST_$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))"
} | ConvertTo-Json -Compress
$created = & $invoke -Tool draw_shape -ArgumentsJson $args | ConvertFrom-Json
$id = [string]$created.result.entity_id
if (-not $id) { throw 'No drawing entity ID returned.' }
& $invoke -Tool draw_list -ArgumentsJson '{}'
& $invoke -Tool draw_remove_one -ArgumentsJson (@{ entity_id = $id } | ConvertTo-Json -Compress)
& $invoke -Tool draw_list -ArgumentsJson '{}'
```

The final list must not contain `$id`.

## Mark up a user chart

For permanent requested analysis:

1. Read chart state and OHLCV.
2. Calculate or identify levels from evidence.
3. Present the intended drawings before destructive cleanup.
4. Use one `draw_shape` call per level, trendline, rectangle, or text label.
5. Keep all returned entity IDs in the response.
6. Capture a screenshot after markup.
7. Do not delete existing user drawings unless explicitly requested.

## Pine Script workflow

1. Read existing source with `pine_get_source` when editing.
2. Preserve a copy of the original source in the evidence response.
3. Set source with `pine_set_source` or the relevant Codex Pine tool.
4. Compile with `pine_compile`.
5. Read `pine_get_errors` and `pine_get_console`.
6. Save only after compilation evidence is acceptable.
7. Read Strategy Tester results separately; compilation is not backtest approval.

A compile success without an error read is `NOT VERIFIED` for final Pine quality.

## Strategy Tester and backtest workflow

Use structured data first:

- `data_get_strategy_results`
- `data_get_trades`
- `data_get_equity`
- `tv_read_strategy_tester_summary`
- `tv_backtest_workflow_check`

Report invalid data, missing trades, insufficient samples, profit factor, drawdown, and approval blockers exactly as returned. Never describe a research candidate as execution-approved solely because it compiled or produced trades.

## Alerts

1. List alerts before creating one.
2. Create the exact requested alert.
3. Capture its identifier.
4. List alerts again and verify it exists.
5. Delete only by exact identifier when cleanup is requested.

## Replay

1. Read `replay_status` before starting.
2. Start at the requested date/time.
3. Verify status.
4. Step or autoplay only as requested.
5. Stop replay and verify normal mode when the workflow is temporary.

Do not place replay trades unless the user explicitly requests simulated replay trading.

## Jarvis and Deriv research

Jarvis, research-candle, autonomy, and matrix tools are analysis/control-plane tools. Preserve their `readOnly`, `researchOnly`, `executionEligible`, and blocker fields.

Use `deriv_research_candles` for research-only symbols. Do not route research-only symbols into execution tools. Use the five `deriv_ea_*` tools only for read-only status, doctor/check, quick-check, and dry backtest evidence.

## Full capability test

Run only when the user requests verification or after recovery:

```powershell
& (Join-Path $runtime 'scripts\run-capability-tests.ps1') -ReversibleMarkupTest
```

This test must create and remove one uniquely labeled drawing and confirm zero test residue. It must not clear existing chart state.
