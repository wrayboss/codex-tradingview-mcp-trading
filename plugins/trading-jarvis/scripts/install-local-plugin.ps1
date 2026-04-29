param(
    [string]$ConfigPath = "$env:USERPROFILE\.codex\config.toml",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$MarketplaceName = "local-trading-operators"
$PluginKey = 'trading-jarvis@local-trading-operators'

if (!(Test-Path $ConfigPath)) {
    $ConfigDir = Split-Path -Parent $ConfigPath
    if (!(Test-Path $ConfigDir)) {
        if ($DryRun) {
            Write-Host "Would create config directory: $ConfigDir"
        } else {
            New-Item -ItemType Directory -Path $ConfigDir | Out-Null
        }
    }
    if ($DryRun) {
        Write-Host "Would create Codex config: $ConfigPath"
    } else {
        New-Item -ItemType File -Path $ConfigPath | Out-Null
    }
}

$existing = if (Test-Path $ConfigPath) { Get-Content -Raw -LiteralPath $ConfigPath } else { "" }
$missingBlocks = @()

if ($existing -notmatch [regex]::Escape("[plugins.`"$PluginKey`"]")) {
    $missingBlocks += @"

[plugins."$PluginKey"]
enabled = true
"@
}

if ($existing -notmatch [regex]::Escape("[marketplaces.$MarketplaceName]")) {
    $missingBlocks += @"

[marketplaces.$MarketplaceName]
source_type = "local"
source = '\\?\$RepoRoot'
"@
}

if ($missingBlocks.Count -eq 0) {
    Write-Host "Trading Jarvis plugin already registered in $ConfigPath"
    exit 0
}

$block = ($missingBlocks -join "`n")
if ($DryRun) {
    Write-Host "Would append to ${ConfigPath}:"
    Write-Host $block
} else {
    Add-Content -LiteralPath $ConfigPath -Value $block
    Write-Host "Registered Trading Jarvis plugin in $ConfigPath"
}
