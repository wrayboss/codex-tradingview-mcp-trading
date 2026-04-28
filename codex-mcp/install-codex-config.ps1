param(
    [string]$ConfigPath = "$env:USERPROFILE\.codex\config.toml"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ServerPath = Join-Path $RepoRoot "codex-mcp\server.js"
$NodeCommand = (Get-Command node -ErrorAction Stop).Source

if (!(Test-Path $ServerPath)) {
    throw "Codex MCP server not found: $ServerPath"
}

$ConfigDir = Split-Path -Parent $ConfigPath
if (!(Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir | Out-Null
}

if (Test-Path $ConfigPath) {
    $existing = Get-Content -Raw -LiteralPath $ConfigPath
} else {
    $existing = ""
}

if ($existing -match '\[mcp_servers\.deriv_trading\]') {
    Write-Host "Codex MCP server 'deriv_trading' already exists in $ConfigPath"
    exit 0
}

$escapedNode = $NodeCommand.Replace('\', '\\')
$escapedServer = $ServerPath.Replace('\', '\\')

$block = @"

[mcp_servers.deriv_trading]
command = "$escapedNode"
args = ["$escapedServer"]
cwd = "$($RepoRoot.Replace('\', '\\'))"

"@

Add-Content -LiteralPath $ConfigPath -Value $block
Write-Host "Added Codex MCP server 'deriv_trading' to $ConfigPath"
