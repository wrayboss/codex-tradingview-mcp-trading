# Latest Status Evidence

This portable repo copy intentionally does not include the old workstation status snapshot.

After cloning on the VPS, refresh local evidence with:

```bash
bash docs/codex/update-status.sh
```

On Windows, use:

```powershell
powershell -ExecutionPolicy Bypass -File docs\codex\agent-control\update-status.ps1 -SkipFetch
```
