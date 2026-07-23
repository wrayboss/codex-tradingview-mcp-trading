param(
    [string]$Destination = "C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview",
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$sourceScripts = $PSScriptRoot
$destinationScripts = Join-Path $Destination "scripts"
$files = @(
    "mcp-client.mjs",
    "invoke-mcp-tool.ps1",
    "verify-environment.ps1",
    "run-capability-tests.ps1"
)

New-Item -ItemType Directory -Force -Path $destinationScripts | Out-Null
$results = New-Object System.Collections.ArrayList

foreach ($name in $files) {
    $source = Join-Path $sourceScripts $name
    $target = Join-Path $destinationScripts $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Packaged runtime file is missing: $source"
    }

    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $existingHash = if (Test-Path -LiteralPath $target -PathType Leaf) {
        (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    } else { $null }

    if ($existingHash -ne $sourceHash) {
        if ($existingHash -and -not $Force) {
            throw "Runtime file differs: $target. Re-run with -Force only after reviewing the packaged source."
        }
        Copy-Item -LiteralPath $source -Destination $target -Force
    }

    $installedHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($installedHash -ne $sourceHash) {
        throw "Hash verification failed after installing $name."
    }
    [void]$results.Add([ordered]@{
        file = $name
        path = $target
        sha256 = $installedHash
        installed = ($existingHash -ne $sourceHash)
    })
}

[ordered]@{
    status = "YES - EXECUTED AND VERIFIED"
    destination = $Destination
    files = @($results)
} | ConvertTo-Json -Depth 10
