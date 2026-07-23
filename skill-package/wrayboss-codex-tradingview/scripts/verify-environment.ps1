param(
    [string]$RepoRoot = "C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading",
    [string]$ExpectedOrigin = "https://github.com/wrayboss/codex-tradingview-mcp-trading.git",
    [string]$ExternalMcp = "C:\Users\Administrator\tradingview-mcp\src\server.js",
    [string]$TradingViewExe = "C:\Users\Administrator\TradingView-CDP\TradingView.exe",
    [string]$CdpUrl = "http://127.0.0.1:9222",
    [int]$ExpectedToolCount = 114,
    [switch]$SkipScreenshot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$invokeScript = Join-Path $PSScriptRoot "invoke-mcp-tool.ps1"
$clientScript = Join-Path $PSScriptRoot "mcp-client.mjs"
$checks = New-Object System.Collections.ArrayList

function Add-Check([string]$Name, [string]$Status, [string]$Detail, $Evidence = $null) {
    [void]$checks.Add([ordered]@{
        name = $Name
        status = $Status
        detail = $Detail
        evidence = $Evidence
    })
}

function Invoke-SkillTool([string]$Name, [string]$Json = "{}") {
    $text = & $invokeScript -Tool $Name -ArgumentsJson $Json -Raw
    if ($LASTEXITCODE -ne 0) { throw "Tool $Name failed: $text" }
    return $text | ConvertFrom-Json -ErrorAction Stop
}

function Finish-Report([string]$ForcedStatus = "") {
    $states = @($checks | ForEach-Object { $_.status })
    $status = if ($ForcedStatus) { $ForcedStatus }
        elseif ($states -contains "BLOCKED") { "BLOCKED" }
        elseif ($states -contains "NOT VERIFIED") { "NOT VERIFIED" }
        elseif ($states -contains "DEGRADED") { "DEGRADED" }
        else { "READY" }
    [ordered]@{
        status = $status
        readyForMutation = ($status -eq "READY")
        checkedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        toolCount = $script:toolCount
        symbol = $script:symbol
        timeframe = $script:timeframe
        checks = @($checks)
    } | ConvertTo-Json -Depth 30
}

$script:toolCount = $null
$script:symbol = $null
$script:timeframe = $null

$requiredFiles = @(
    @{ Name = "Codex repository"; Path = $RepoRoot; Type = "Container" },
    @{ Name = "Codex MCP server"; Path = (Join-Path $RepoRoot "codex-mcp\server.js"); Type = "Leaf" },
    @{ Name = "Full TradingView MCP server"; Path = $ExternalMcp; Type = "Leaf" },
    @{ Name = "Local TradingView CDP binary"; Path = $TradingViewExe; Type = "Leaf" },
    @{ Name = "Package MCP client"; Path = $clientScript; Type = "Leaf" },
    @{ Name = "Package invocation wrapper"; Path = $invokeScript; Type = "Leaf" }
)
foreach ($item in $requiredFiles) {
    if (Test-Path -LiteralPath $item.Path -PathType $item.Type) {
        Add-Check $item.Name "YES" "Required path exists." $item.Path
    } else {
        Add-Check $item.Name "BLOCKED" "Required path is missing." $item.Path
    }
}

if (@($checks | Where-Object { $_.status -eq "BLOCKED" }).Count -gt 0) {
    Finish-Report "BLOCKED"
    exit 1
}

try {
    $origin = (& git -C $RepoRoot remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0) { throw "git remote get-url origin failed" }
    if ($origin -eq $ExpectedOrigin) {
        Add-Check "Canonical Codex origin" "YES" "Origin matches the required wrayboss repository." $origin
    } else {
        Add-Check "Canonical Codex origin" "BLOCKED" "Origin mismatch; no fallback is permitted." $origin
    }
} catch {
    Add-Check "Canonical Codex origin" "BLOCKED" "Could not verify Git origin." $_.Exception.Message
}

$env:WRAYBOSS_CODEX_REPO = $RepoRoot
$env:CODEX_TRADINGVIEW_MCP_SERVER = $ExternalMcp
$env:TRADINGVIEW_EXE = $TradingViewExe
$env:TRADINGVIEW_CDP_URL = $CdpUrl

try {
    $version = Invoke-RestMethod -Uri "$CdpUrl/json/version" -TimeoutSec 5
    Add-Check "TradingView CDP" "YES" "CDP version endpoint responded." ([ordered]@{
        browser = $version.Browser
        protocolVersion = $version.'Protocol-Version'
        websocketAvailable = [bool]$version.webSocketDebuggerUrl
    })
} catch {
    Add-Check "TradingView CDP" "BLOCKED" "CDP endpoint did not respond." $_.Exception.Message
}

try {
    $targetResponse = Invoke-RestMethod -Uri "$CdpUrl/json" -TimeoutSec 5
    $targets = New-Object System.Collections.ArrayList
    foreach ($target in $targetResponse) { [void]$targets.Add($target) }
    $chartTargets = @($targets | Where-Object { $_.url -match "tradingview\.com/chart/" })
    if ($chartTargets.Count -gt 0) {
        $firstChart = $chartTargets | Select-Object -First 1
        Add-Check "Local chart target" "YES" "A local TradingView chart target is open." ([ordered]@{
            count = $chartTargets.Count
            title = [string]$firstChart.title
            url = [string]$firstChart.url
        })
    } else {
        Add-Check "Local chart target" "BLOCKED" "No tradingview.com/chart/ CDP target is open." $targets.Count
    }
} catch {
    Add-Check "Local chart target" "BLOCKED" "Could not enumerate CDP targets." $_.Exception.Message
}

try {
    $listText = (& node $clientScript list) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) { throw $listText }
    $list = $listText | ConvertFrom-Json -ErrorAction Stop
    $script:toolCount = [int]$list.toolCount
    $names = @($list.tools | ForEach-Object { $_.name })
    $requiredNames = @(
        "chart_get_state", "draw_shape", "draw_remove_one", "capture_screenshot",
        "pine_compile", "replay_status", "alert_list", "jarvis_morning_brief",
        "deriv_ea_status"
    )
    $missing = @($requiredNames | Where-Object { $_ -notin $names })
    if ($list.toolCount -eq $ExpectedToolCount -and $missing.Count -eq 0) {
        Add-Check "Combined MCP registry" "YES" "Exact verified tool count and required categories are present." ([ordered]@{
            count = $list.toolCount
            requiredTools = $requiredNames
        })
    } else {
        Add-Check "Combined MCP registry" "BLOCKED" "Tool registry does not match the verified Codex build." ([ordered]@{
            expectedCount = $ExpectedToolCount
            actualCount = $list.toolCount
            missingTools = $missing
        })
    }
} catch {
    Add-Check "Combined MCP registry" "BLOCKED" "Could not list MCP tools." $_.Exception.Message
}

try {
    $health = Invoke-SkillTool "tv_health_check"
    if ($health.result.connected -eq $true) {
        Add-Check "MCP health tool" "YES" "tv_health_check confirmed the live local app connection." $health.result
    } else {
        Add-Check "MCP health tool" "BLOCKED" "tv_health_check did not report connected=true." $health
    }
} catch {
    Add-Check "MCP health tool" "BLOCKED" "tv_health_check failed." $_.Exception.Message
}

try {
    $state = Invoke-SkillTool "chart_get_state"
    if ($state.result.success -eq $true -and $state.result.symbol -and $state.result.resolution) {
        $script:symbol = [string]$state.result.symbol
        $script:timeframe = [string]$state.result.resolution
        Add-Check "Chart state" "YES" "Current symbol and timeframe are readable." $state.result
    } else {
        Add-Check "Chart state" "BLOCKED" "chart_get_state returned incomplete evidence." $state
    }
} catch {
    Add-Check "Chart state" "BLOCKED" "chart_get_state failed." $_.Exception.Message
}

if (-not $SkipScreenshot) {
    try {
        $filename = "wrayboss-skill-preflight-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss")
        $args = @{ region = "chart"; filename = $filename } | ConvertTo-Json -Compress
        $shot = Invoke-SkillTool "capture_screenshot" $args
        $path = [string]$shot.result.file_path
        if ($shot.result.success -eq $true -and (Test-Path -LiteralPath $path -PathType Leaf) -and (Get-Item $path).Length -gt 0) {
            Add-Check "Screenshot evidence" "YES" "Chart screenshot was captured and verified on disk." ([ordered]@{
                path = $path
                bytes = (Get-Item $path).Length
            })
        } else {
            Add-Check "Screenshot evidence" "DEGRADED" "Screenshot result was not verifiable on disk." $shot
        }
    } catch {
        Add-Check "Screenshot evidence" "DEGRADED" "Screenshot verification failed." $_.Exception.Message
    }
} else {
    Add-Check "Screenshot evidence" "NOT VERIFIED" "Skipped by caller; mutation is not authorized." $null
}

Finish-Report
if (@($checks | Where-Object { $_.status -eq "BLOCKED" }).Count -gt 0) { exit 1 }
if (@($checks | Where-Object { $_.status -in @("DEGRADED", "NOT VERIFIED") }).Count -gt 0) { exit 2 }
