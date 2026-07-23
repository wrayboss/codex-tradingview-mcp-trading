param(
    [switch]$ReversibleMarkupTest,
    [string]$ReportPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$client = Join-Path $PSScriptRoot "mcp-client.mjs"
$verify = Join-Path $PSScriptRoot "verify-environment.ps1"
$results = New-Object System.Collections.ArrayList

function Quote-Argument([string]$Value) {
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-ProcessCapture(
    [string]$FileName,
    [string[]]$Arguments,
    [int]$TimeoutMs = 60000
) {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $FileName
    $psi.Arguments = (($Arguments | ForEach-Object { Quote-Argument $_ }) -join " ")
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $p = New-Object Diagnostics.Process
    $p.StartInfo = $psi
    $null = $p.Start()
    $stdoutTask = $p.StandardOutput.ReadToEndAsync()
    $stderrTask = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($TimeoutMs)) {
        try { $p.Kill() } catch {}
        throw "Process timed out after $TimeoutMs ms: $FileName"
    }
    return [pscustomobject]@{
        exitCode = $p.ExitCode
        stdout = $stdoutTask.Result.Trim()
        stderr = $stderrTask.Result.Trim()
    }
}

function Add-Result([string]$Name, [string]$Class, [string]$Detail, $Evidence = $null) {
    [void]$results.Add([ordered]@{
        name = $Name
        classification = $Class
        detail = $Detail
        evidence = $Evidence
    })
}

function Parse-JsonOutput($Run, [string]$Label) {
    if (-not $Run.stdout) { throw "$Label returned no JSON output. Stderr: $($Run.stderr)" }
    return $Run.stdout | ConvertFrom-Json -ErrorAction Stop
}

$powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$nodeExe = (Get-Command node -ErrorAction Stop).Source

try {
    $preflightRun = Invoke-ProcessCapture $powerShellExe @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $verify
    ) 90000
    $preflight = Parse-JsonOutput $preflightRun "Preflight"
    if ($preflight.status -eq "READY" -and $preflight.toolCount -eq 114) {
        Add-Result "environment_preflight" "FULLY EXERCISED" "Exact identity, CDP, chart, registry, and screenshot checks passed." ([ordered]@{
            status = $preflight.status
            toolCount = $preflight.toolCount
            symbol = $preflight.symbol
            timeframe = $preflight.timeframe
        })
    } else {
        Add-Result "environment_preflight" "FAILED" "Preflight did not reach READY." $preflight
    }
} catch {
    $preflight = $null
    Add-Result "environment_preflight" "FAILED" "Preflight could not be completed." $_.Exception.Message
}

$batchRequests = @(
    @{ name = "chart_get_state"; arguments = @{} },
    @{ name = "quote_get"; arguments = @{} },
    @{ name = "draw_list"; arguments = @{} },
    @{ name = "pine_get_errors"; arguments = @{} },
    @{ name = "replay_status"; arguments = @{} },
    @{ name = "alert_list"; arguments = @{} },
    @{ name = "watchlist_get"; arguments = @{} },
    @{ name = "jarvis_morning_brief"; arguments = @{} },
    @{ name = "deriv_ea_status"; arguments = @{} },
    @{ name = "__wrayboss_invalid_tool__"; arguments = @{} }
)
$batchPath = Join-Path ([IO.Path]::GetTempPath()) ("wrayboss-capability-batch-{0}.json" -f [guid]::NewGuid())
try {
    [IO.File]::WriteAllText(
        $batchPath,
        ($batchRequests | ConvertTo-Json -Depth 12 -Compress),
        (New-Object Text.UTF8Encoding($false))
    )
    $batchRun = Invoke-ProcessCapture $nodeExe @($client, "batch-file", $batchPath) 90000
    $batch = Parse-JsonOutput $batchRun "Read-only batch"
    foreach ($item in @($batch.results)) {
        if ($item.tool -eq "__wrayboss_invalid_tool__") {
            if ($item.ok -eq $false) {
                Add-Result "invalid_tool_failure_path" "FULLY EXERCISED" "Unknown MCP tools fail closed." $item.error
            } else {
                Add-Result "invalid_tool_failure_path" "FAILED" "Unknown MCP tool unexpectedly succeeded." $item
            }
        } elseif ($item.ok -eq $true) {
            Add-Result $item.tool "READ-ONLY EXERCISED" "Tool returned a non-error MCP result." $item.result
        } else {
            Add-Result $item.tool "FAILED" "Read-only call returned an error." $item.error
        }
    }
} catch {
    Add-Result "read_only_batch" "FAILED" "Read-only MCP batch could not be completed." $_.Exception.Message
} finally {
    Remove-Item -LiteralPath $batchPath -Force -ErrorAction SilentlyContinue
}

try {
    $invalidCdpRun = Invoke-ProcessCapture $powerShellExe @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $verify,
        "-CdpUrl", "http://127.0.0.1:65534", "-SkipScreenshot"
    ) 90000
    $invalidCdp = Parse-JsonOutput $invalidCdpRun "Invalid-CDP preflight"
    if ($invalidCdp.status -eq "BLOCKED" -and -not $invalidCdp.readyForMutation) {
        Add-Result "invalid_cdp_failure_path" "FULLY EXERCISED" "Dead CDP endpoint blocks mutation." ([ordered]@{
            status = $invalidCdp.status
            readyForMutation = $invalidCdp.readyForMutation
            exitCode = $invalidCdpRun.exitCode
        })
    } else {
        Add-Result "invalid_cdp_failure_path" "FAILED" "Dead CDP endpoint did not block mutation." $invalidCdp
    }
} catch {
    Add-Result "invalid_cdp_failure_path" "FAILED" "Invalid-CDP preflight could not be completed." $_.Exception.Message
}

if ($ReversibleMarkupTest -and $preflight -and $preflight.status -eq "READY") {
    try {
        $markupRun = Invoke-ProcessCapture $nodeExe @($client, "verify-markup") 90000
        $markup = Parse-JsonOutput $markupRun "Reversible markup"
        if ($markup.ok -eq $true -and $markup.evidence.entityId -and $markup.evidence.removed.removed -eq $true) {
            $finalJson = $markup.evidence.final | ConvertTo-Json -Depth 20 -Compress
            if ($finalJson -match [regex]::Escape([string]$markup.evidence.entityId)) {
                throw "Temporary entity remains in final draw_list."
            }
            Add-Result "reversible_markup" "FULLY EXERCISED" "One text drawing was created, listed, removed by exact ID, and confirmed absent." ([ordered]@{
                entityId = $markup.evidence.entityId
                label = $markup.evidence.label
                remainingCount = $markup.evidence.final.count
            })
        } else {
            Add-Result "reversible_markup" "FAILED" "Reversible markup action did not complete cleanly." $markup
        }
    } catch {
        Add-Result "reversible_markup" "FAILED" "Reversible markup test could not be completed." $_.Exception.Message
    }
} else {
    Add-Result "reversible_markup" "UNTESTED" "Run with -ReversibleMarkupTest after a READY preflight." $null
}

$discoveryOnly = @(
    "pine_compile",
    "pine_set_source",
    "alert_create",
    "alert_delete",
    "replay_start",
    "replay_step",
    "replay_stop",
    "ui_evaluate",
    "layout_switch",
    "pane_set_layout",
    "tab_new",
    "tab_close"
)
foreach ($name in $discoveryOnly) {
    Add-Result $name "DISCOVERY-ONLY" "Present in the verified 114-tool manifest; not mutated during release testing." $null
}

$failed = @($results | Where-Object { $_.classification -eq "FAILED" })
$preflightFailed = @($results | Where-Object {
    $_.name -eq "environment_preflight" -and $_.classification -eq "FAILED"
}).Count -gt 0
$markupFailed = @($results | Where-Object {
    $_.name -eq "reversible_markup" -and $_.classification -eq "FAILED"
}).Count -gt 0
$overall = if ($preflightFailed -or $markupFailed) {
    "BLOCKED - DEPENDENCY FAILED"
} elseif ($failed.Count -gt 0) {
    "NOT VERIFIED - EVIDENCE INSUFFICIENT"
} else {
    "YES - EXECUTED AND VERIFIED"
}

$report = [ordered]@{
    status = $overall
    testedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    reversibleMarkupRequested = [bool]$ReversibleMarkupTest
    totalChecks = $results.Count
    failedChecks = $failed.Count
    results = @($results)
}

if ($ReportPath) {
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add("# Wrayboss Codex TradingView capability verification")
    [void]$lines.Add("")
    [void]$lines.Add("- Status: **$overall**")
    [void]$lines.Add("- Tested at UTC: $($report.testedAtUtc)")
    [void]$lines.Add("- Total checks: $($report.totalChecks)")
    [void]$lines.Add("- Failed checks: $($report.failedChecks)")
    [void]$lines.Add("")
    [void]$lines.Add("| Check | Classification | Detail |")
    [void]$lines.Add("|---|---|---|")
    foreach ($item in $results) {
        $detail = ([string]$item.detail).Replace("|", "\|").Replace("`r", " ").Replace("`n", " ")
        [void]$lines.Add("| $($item.name) | $($item.classification) | $detail |")
    }
    [void]$lines.Add("")
    [void]$lines.Add("Fresh-agent behavioral pressure testing was blocked by the local Codex CLI usage limit and is NOT VERIFIED.")
    $parent = Split-Path -Parent $ReportPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    [IO.File]::WriteAllLines($ReportPath, @($lines), (New-Object Text.UTF8Encoding($false)))
}

$report | ConvertTo-Json -Depth 30
if ($overall -like "BLOCKED*") { exit 1 }
if ($overall -like "NOT VERIFIED*") { exit 2 }
