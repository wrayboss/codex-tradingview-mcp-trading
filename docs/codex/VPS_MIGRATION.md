# VPS Migration Notes

## Purpose

Use this checklist after cloning the repo on a VPS so Codex can recover the shared operating context without the old Windows path.

## Checklist

1. Confirm the exported Codex memories are installed in the new Codex app.
2. Clone this repo and read `AGENTS.md`.
3. Read `docs/codex/agent-control/AGENTS.md`.
4. Read `docs/codex/llm-wiki/AGENTS.md`.
5. Run a status refresh from the repo root:

```bash
bash docs/codex/update-status.sh
```

6. Update any repo paths in `docs/codex/agent-control/repos.yaml` if the VPS checkout paths differ from the old Windows paths.
7. Keep `.env`, API tokens, Deriv tokens, SSH keys, and account files out of Git.

## Notes

- Some copied wiki pages preserve old Windows paths as historical evidence.
- On the VPS, prefer repo-relative paths under `docs/codex/`.
- The PowerShell script `docs/codex/agent-control/update-status.ps1` is preserved for Windows. Use `docs/codex/update-status.sh` on Linux.
