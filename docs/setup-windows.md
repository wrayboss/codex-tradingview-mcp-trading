# Windows Setup Guide

Everything in the main README applies — the only differences are how you launch TradingView with CDP enabled and where the files live.

---

## 1. Prefer The Repo Launcher

From the repo root:

```powershell
npm run launch
```

That runs `launch.ps1`, discovers the current TradingView Desktop executable from AppX/MSIX package locations, closes any existing TradingView process, launches TradingView Desktop with `--remote-debugging-port=9222`, and checks the CDP endpoint.

If `launch.ps1` cannot find your TradingView executable, use the manual steps below to verify the package path or set a local `TRADINGVIEW_EXE` override. Do not pin the checked-in script to one TradingView package version.

---

## 2. Verify The TradingView Package

TradingView Desktop on Windows is usually installed as an AppX/MSIX package. The package version changes over time, so the repo launcher resolves it dynamically instead of storing a fixed `WindowsApps\TradingView.Desktop_<version>` path.

To inspect the installed package:

```powershell
Get-AppxPackage -Name "TradingView*" | Select-Object Name, Version, InstallLocation
```

Common executable locations look like:

```
C:\Program Files\WindowsApps\TradingView.Desktop_...\TradingView.exe
C:\Users\[YourName]\AppData\Local\Packages\TradingView.TradingViewDesktop_[hash]\LocalCache\Local\TradingView\TradingView.exe
```

To test what the repo launcher will use without starting TradingView:

```powershell
powershell -ExecutionPolicy Bypass -File .\launch.ps1 -ResolveOnly
```

If TradingView is installed somewhere custom, set a local override for the current PowerShell session:

```powershell
$env:TRADINGVIEW_EXE = "C:\path\to\TradingView.exe"
npm run launch
```

---

## 3. Launch TradingView with CDP enabled

You need to launch TradingView with the `--remote-debugging-port=9222` flag so local chart tools can connect.

Close TradingView if it's running, then in PowerShell:

```powershell
Stop-Process -Name "TradingView" -ErrorAction SilentlyContinue
& "C:\path\to\TradingView.exe" --remote-debugging-port=9222
```

Replace the path with the one reported by `.\launch.ps1 -ResolveOnly` or `Get-AppxPackage`.

The checked-in `launch.ps1` is the preferred repeatable version of this command because it avoids hard-coded TradingView package versions.

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
