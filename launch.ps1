param(
    [switch]$ResolveOnly
)

# Launch TradingView Desktop with CDP enabled for local MCP/Codex chart tools.
# Run this once before using tv_health_check or TradingView chart actions.

$ErrorActionPreference = "Stop"
$CDP_PORT = 9222
$CDP_VERSION_URL = "http://localhost:$CDP_PORT/json/version"

function Add-TradingViewCandidate {
    param(
        [System.Collections.ArrayList]$Candidates,
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $resolved = (Resolve-Path -LiteralPath $Path).Path
        if (-not $Candidates.Contains($resolved)) {
            [void]$Candidates.Add($resolved)
        }
    }
}

function Resolve-TradingViewExecutable {
    $candidates = [System.Collections.ArrayList]::new()

    Add-TradingViewCandidate -Candidates $candidates -Path $env:TRADINGVIEW_EXE
    Add-TradingViewCandidate -Candidates $candidates -Path $env:TV_EXE

    $appxPackages = @()
    if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
        $appxPackages = @(Get-AppxPackage -Name "TradingView*" -ErrorAction SilentlyContinue |
            Where-Object { $_.InstallLocation } |
            Sort-Object -Property Version -Descending)
    }

    foreach ($package in $appxPackages) {
        Add-TradingViewCandidate -Candidates $candidates -Path (Join-Path $package.InstallLocation "TradingView.exe")

        if ($candidates.Count -eq 0) {
            Get-ChildItem -LiteralPath $package.InstallLocation -Filter "TradingView.exe" -File -Recurse -ErrorAction SilentlyContinue |
                ForEach-Object { Add-TradingViewCandidate -Candidates $candidates -Path $_.FullName }
        }
    }

    if ($env:LOCALAPPDATA) {
        $packageRoot = Join-Path $env:LOCALAPPDATA "Packages"
        if (Test-Path -LiteralPath $packageRoot -PathType Container) {
            Get-ChildItem -LiteralPath $packageRoot -Directory -Filter "TradingView*" -ErrorAction SilentlyContinue |
                Sort-Object -Property Name -Descending |
                ForEach-Object {
                    Add-TradingViewCandidate -Candidates $candidates -Path (Join-Path $_.FullName "LocalCache\Local\TradingView\TradingView.exe")
                }
        }
    }

    $windowsApps = Join-Path $env:ProgramFiles "WindowsApps"
    if (Test-Path -LiteralPath $windowsApps -PathType Container) {
        Get-ChildItem -LiteralPath $windowsApps -Directory -Filter "TradingView*" -ErrorAction SilentlyContinue |
            Sort-Object -Property Name -Descending |
            ForEach-Object {
                Add-TradingViewCandidate -Candidates $candidates -Path (Join-Path $_.FullName "TradingView.exe")
            }
    }

    if ($candidates.Count -gt 0) {
        return [string]$candidates[0]
    }

    throw @"
TradingView.exe was not found.

Install or update TradingView Desktop, then run:
  Get-AppxPackage -Name "TradingView*" | Select-Object Name, Version, InstallLocation

If TradingView is installed outside AppX/MSIX package paths, set TRADINGVIEW_EXE to the full TradingView.exe path before running npm run launch.
"@
}

$TV_EXE = Resolve-TradingViewExecutable

if ($ResolveOnly) {
    Write-Output $TV_EXE
    exit 0
}

# Kill any existing TradingView instance so the CDP flag is applied to the new process.
Write-Host "Stopping any existing TradingView..." -ForegroundColor Yellow
Stop-Process -Name "TradingView" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Launch with CDP.
Write-Host "Launching TradingView with CDP on port $CDP_PORT..." -ForegroundColor Cyan
Write-Host "  Executable: $TV_EXE" -ForegroundColor Gray
Start-Process -FilePath $TV_EXE -ArgumentList "--remote-debugging-port=$CDP_PORT"
Start-Sleep -Seconds 4

# Verify CDP is up.
try {
    $response = Invoke-RestMethod -Uri $CDP_VERSION_URL -TimeoutSec 5
    Write-Host "TradingView connected!" -ForegroundColor Green
    Write-Host "  Browser: $($response.Browser)" -ForegroundColor Gray
} catch {
    Write-Host "Waiting for CDP..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    try {
        Invoke-RestMethod -Uri $CDP_VERSION_URL -TimeoutSec 5 | Out-Null
        Write-Host "TradingView connected!" -ForegroundColor Green
    } catch {
        Write-Host "CDP not responding - TradingView may still be loading. Try tv_health_check after it opens." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Next: run tv_health_check from your MCP bridge, then open R_75/R_50 on the 15m chart." -ForegroundColor White
