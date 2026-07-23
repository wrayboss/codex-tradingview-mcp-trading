# Environment contract

## Required machine identity

The skill operates one authorized Windows VPS through Remote Desktop Commander. It requires:

- PowerShell 5.1 or later
- Node.js 18 or later
- Git
- `C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading`
- origin `https://github.com/wrayboss/codex-tradingview-mcp-trading.git`
- `C:\Users\Administrator\tradingview-mcp\src\server.js`
- `C:\Users\Administrator\TradingView-CDP\TradingView.exe`
- CDP at `http://127.0.0.1:9222`

No other user profile, repository path, or executable is implicitly trusted.

## Runtime cache

Package scripts must be installed at:

```text
C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview\scripts
```

Expected files:

```text
mcp-client.mjs
invoke-mcp-tool.ps1
verify-environment.ps1
run-capability-tests.ps1
```

A ChatGPT Skill upload does not prove that those files were copied to the VPS. Check the cache on every new machine. Compare its hashes with `tests/script-hashes.json` before executing it.

## Installing the runtime

When the unpacked skill folder is already available on the VPS, run:

```powershell
& '.\scripts\install-runtime.ps1'
```

When skill resources are available only inside ChatGPT, use Remote Desktop Commander `create_directory` and `write_file` to copy each packaged script exactly. Write files in chunks; do not reconstruct them from memory. Then compare SHA-256 hashes.

If the host cannot expose the packaged resources for transfer, report:

```text
BLOCKED — DEPENDENCY FAILED
The ChatGPT Skill resources are not accessible for installation on the VPS.
```

Do not download similarly named scripts from GitHub as a substitute.

## Runtime verification

```powershell
$runtime = 'C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview'
Get-ChildItem "$runtime\scripts" -File | Get-FileHash -Algorithm SHA256
& "$runtime\scripts\verify-environment.ps1"
```

Only `READY` authorizes mutation.

## Launching local TradingView

First test CDP:

```powershell
Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 5
```

When no TradingView process is active:

```powershell
Start-Process `
  -FilePath 'C:\Users\Administrator\TradingView-CDP\TradingView.exe' `
  -ArgumentList '--remote-debugging-port=9222'
```

When TradingView is already active without CDP, do not stop it silently. Report that relaunching can disrupt the logged-in local session and obtain explicit approval before termination.

Never launch the executable under `C:\Program Files\WindowsApps`; Windows blocks direct custom-argument execution and it is not the approved CDP binary.
