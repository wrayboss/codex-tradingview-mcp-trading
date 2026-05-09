param(
    [switch]$ResolveOnly,
    [switch]$ForceRelaunch,
    [string]$UserDataDir = $env:TRADINGVIEW_USER_DATA_DIR
)

# Launch TradingView Desktop with CDP enabled for local MCP/Codex chart tools.
# Run this once before using tv_health_check or TradingView chart actions.

$ErrorActionPreference = "Stop"
$CDP_PORT = 9222
$CDP_VERSION_URL = "http://localhost:$CDP_PORT/json/version"

function Test-TradingViewCdp {
    try {
        return Invoke-RestMethod -Uri $CDP_VERSION_URL -TimeoutSec 3
    } catch {
        return $null
    }
}

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

$existingCdp = Test-TradingViewCdp
if ($existingCdp) {
    Write-Host "TradingView CDP is already available on port $CDP_PORT. Reusing the running session." -ForegroundColor Green
    Write-Host "  Browser: $($existingCdp.Browser)" -ForegroundColor Gray
    exit 0
}

$runningTradingView = @(Get-Process -Name "TradingView" -ErrorAction SilentlyContinue)
if ($runningTradingView.Count -gt 0 -and -not $ForceRelaunch) {
    Write-Host "Existing TradingView is running without CDP. Not stopping it by default because it may be the logged-in paid account session." -ForegroundColor Yellow
    Write-Host "Close TradingView manually, then run npm run launch again; or run .\launch.ps1 -ForceRelaunch if you intentionally want Codex to stop and relaunch it." -ForegroundColor Yellow
    Write-Host "If needed, pin the paid-profile executable with TRADINGVIEW_EXE and profile data with TRADINGVIEW_USER_DATA_DIR before launching." -ForegroundColor Yellow
    exit 1
}

if ($ForceRelaunch -and $runningTradingView.Count -gt 0) {
    Write-Host "ForceRelaunch requested. Stopping existing TradingView..." -ForegroundColor Yellow
    Stop-Process -Name "TradingView" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Launch with CDP.
Write-Host "Launching TradingView with CDP on port $CDP_PORT..." -ForegroundColor Cyan
Write-Host "  Executable: $TV_EXE" -ForegroundColor Gray
$launchArgs = @("--remote-debugging-port=$CDP_PORT")
if (-not [string]::IsNullOrWhiteSpace($UserDataDir)) {
    $resolvedUserDataDir = $UserDataDir
    if (Test-Path -LiteralPath $UserDataDir -PathType Container) {
        $resolvedUserDataDir = (Resolve-Path -LiteralPath $UserDataDir).Path
    }
    Write-Host "  User data dir: $resolvedUserDataDir" -ForegroundColor Gray
    $launchArgs += "`"--user-data-dir=$resolvedUserDataDir`""
}
Start-Process -FilePath $TV_EXE -ArgumentList $launchArgs
Start-Sleep -Seconds 4

# Verify CDP is up.
$response = Test-TradingViewCdp
if ($response) {
    Write-Host "TradingView connected!" -ForegroundColor Green
    Write-Host "  Browser: $($response.Browser)" -ForegroundColor Gray
} else {
    Write-Host "Waiting for CDP..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    $response = Test-TradingViewCdp
    if ($response) {
        Write-Host "TradingView connected!" -ForegroundColor Green
    } else {
        Write-Host "CDP not responding - TradingView may still be loading. Try tv_health_check after it opens." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Next: run tv_health_check from your MCP bridge, then open R_75/R_50 on the 15m chart." -ForegroundColor White
