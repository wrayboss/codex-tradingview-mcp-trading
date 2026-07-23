# Recovery playbook

Always preserve the failed command and its output. Repair one layer at a time.

## Failure classification

| Symptom | Class | First check |
|---|---|---|
| Remote tools unavailable | Connector | Confirm Remote Desktop Commander device is online. |
| Repo or server missing | Identity/filesystem | Test exact paths and Git origin. |
| Node import/module failure | Dependency | Check Node version and `node_modules`. |
| MCP connection closes | MCP process | Run `mcp-client.mjs list` and capture stderr. |
| Port 9222 refuses connection | CDP process | Query `/json/version`; inspect TradingView process command line. |
| CDP works but no chart | Target/UI | Query `/json`; open a local TradingView chart tab. |
| Tool returns schema error | Invocation | Read the exact tool schema and correct JSON only. |
| Tool succeeds but state unchanged | Verification/UI | Re-read state and capture screenshot; do not claim success. |
| Temporary drawing remains | Cleanup | Remove by exact entity ID and verify absence. |

## 1. Connector

If the authorized VPS is unreachable, report `BLOCKED`. Do not use GitHub or a local sandbox as a substitute for live TradingView access.

## 2. Identity and origin

```powershell
$repo = 'C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading'
Test-Path $repo
Test-Path "$repo\codex-mcp\server.js"
git -C $repo remote get-url origin
```

Required origin:

```text
https://github.com/wrayboss/codex-tradingview-mcp-trading.git
```

When the folder is missing, inspect GitHub and recover into the exact path only after confirming there is no local work to preserve. When the path exists but is not a repository, move it aside rather than cloning over it.

Never recover from the Claude-named repository or the upstream Jackson repository.

## 3. Node and dependencies

```powershell
node --version
Test-Path "$repo\node_modules\@modelcontextprotocol\sdk"
```

If dependencies are missing:

```powershell
Set-Location $repo
npm install
npm test
npm run codex:check
npm run scan:secrets
```

Do not run `npm audit fix --force` as routine recovery. It can introduce breaking changes.

## 4. MCP bridge

```powershell
$runtime = 'C:\Users\Administrator\.chatgpt-skills\wrayboss-codex-tradingview'
node "$runtime\scripts\mcp-client.mjs" list
```

Expected: `ok=true` and `toolCount=114`.

If the result is 34, the external server binding is missing. Verify:

```text
CODEX_TRADINGVIEW_MCP_SERVER=C:\Users\Administrator\tradingview-mcp\src\server.js
```

If the count differs from 114, stop mutation and report the actual count. A changed registry requires a new reviewed manifest; do not silently relax the check.

## 5. CDP and TradingView Desktop

```powershell
Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 5
Get-CimInstance Win32_Process -Filter "Name='TradingView.exe'" |
    Select-Object ProcessId, ExecutablePath, CommandLine
```

Approved executable:

```text
C:\Users\Administrator\TradingView-CDP\TradingView.exe
```

If no TradingView process is active, launch it with `--remote-debugging-port=9222` and poll `/json/version`.

If a TradingView process is active without CDP, do not kill it without explicit approval. Explain that relaunching may disrupt the logged-in local session.

## 6. Chart target

```powershell
Invoke-RestMethod 'http://127.0.0.1:9222/json' -TimeoutSec 5 |
    Where-Object { $_.url -match 'tradingview\.com/chart/' }
```

When no chart target exists, open a chart in the local TradingView app. A normal browser chart is not acceptable.

## 7. Tool errors

- Read the schema from `mcp-client.mjs list` or `tests/expected-tools.json`.
- Correct only the arguments.
- Do not replace a semantic tool with raw clicks until the semantic path is proven broken.
- Preserve the original error and the corrected result.

## 8. Verification failure

When a state-changing tool returns success but after-state evidence disagrees:

1. Mark the operation `NOT VERIFIED`.
2. Capture a screenshot and structured state.
3. Diagnose stale UI, wrong chart target, or entity mismatch.
4. Do not repeat the mutation blindly.

## 9. Runtime cache repair

Compare files against `tests/script-hashes.json`. If mismatched, reinstall exact packaged scripts. Do not edit the runtime copy directly; fix the package source, retest, and reinstall.

## 10. Resume after interruption

Read the latest tool output, entity IDs, screenshot paths, and state records. Continue from the last verified checkpoint. Never rescan the VPS or repeat a mutation solely because the chat stream failed.
