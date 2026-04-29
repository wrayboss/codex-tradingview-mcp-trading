# Windows Setup Guide

Everything in the main README applies — the only differences are how you launch TradingView with CDP enabled and where the files live.

---

## 1. Prefer The Repo Launcher

From the repo root:

```powershell
npm run launch
```

That runs `launch.ps1`, closes any existing TradingView process, launches TradingView Desktop with `--remote-debugging-port=9222`, and checks the CDP endpoint.

If `launch.ps1` cannot find your TradingView executable, use the manual steps below to find the correct path and update `$TV_EXE` in `launch.ps1`.

---

## 2. Find your TradingView executable

TradingView Desktop on Windows may be installed as an `.msix` package under `WindowsApps` or under the user package cache. Find the exact install location with:

```powershell
Get-AppxPackage -Name "TradingView*" | Select-Object Name, InstallLocation
```

Common paths look like:

```
C:\Program Files\WindowsApps\TradingView.Desktop_...\TradingView.exe
C:\Users\[YourName]\AppData\Local\Packages\TradingView.TradingViewDesktop_[hash]\LocalCache\Local\TradingView\TradingView.exe
```

---

## 3. Launch TradingView with CDP enabled

You need to launch TradingView with the `--remote-debugging-port=9222` flag so local chart tools can connect.

Close TradingView if it's running, then in PowerShell:

```powershell
Stop-Process -Name "TradingView" -ErrorAction SilentlyContinue
& "C:\path\to\TradingView.exe" --remote-debugging-port=9222
```

Replace the path with the one you found in Step 2.

The checked-in `launch.ps1` is the preferred repeatable version of this command.

---

## 4. Configure The Codex Bridge

For Codex-side tools, install the local bridge from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\codex-mcp\install-codex-config.ps1
```

This updates Codex's config only. It does not modify Claude Code's MCP config.

---

## 5. Verify the connection

From the MCP bridge:

```
tv_health_check
```

If it reports a connected TradingView target, you are ready to open `DERIV:VOLATILITY_75_INDEX` or `DERIV:VOLATILITY_50_INDEX` on a 15m chart. If not:
- Make sure TradingView was launched with the `--remote-debugging-port=9222` flag (not opened normally)
- Check that nothing else is using port 9222
- Try closing and relaunching TradingView with `npm run launch`

---

## 6. Continue with the main setup

Once `tv_health_check` passes, go back to the [main README](../README.md) and continue from Step 2.
