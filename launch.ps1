# Launch TradingView Desktop with CDP enabled for local MCP/Codex chart tools.
# Run this once before using tv_health_check or TradingView chart actions.

$TV_EXE = "C:\Program Files\WindowsApps\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\TradingView.exe"

# Kill any existing TradingView instance
Write-Host "Stopping any existing TradingView..." -ForegroundColor Yellow
Stop-Process -Name "TradingView" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Launch with CDP
Write-Host "Launching TradingView with CDP on port 9222..." -ForegroundColor Cyan
Start-Process -FilePath $TV_EXE -ArgumentList "--remote-debugging-port=9222"
Start-Sleep -Seconds 4

# Verify CDP is up
try {
    $response = Invoke-RestMethod -Uri "http://localhost:9222/json/version" -TimeoutSec 5
    Write-Host "TradingView connected!" -ForegroundColor Green
    Write-Host "  Browser: $($response.Browser)" -ForegroundColor Gray
} catch {
    Write-Host "Waiting for CDP..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    try {
        Invoke-RestMethod -Uri "http://localhost:9222/json/version" -TimeoutSec 5 | Out-Null
        Write-Host "TradingView connected!" -ForegroundColor Green
    } catch {
        Write-Host "CDP not responding - TradingView may still be loading. Try tv_health_check after it opens." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Next: run tv_health_check from your MCP bridge, then open R_75/R_50 on the 15m chart." -ForegroundColor White
