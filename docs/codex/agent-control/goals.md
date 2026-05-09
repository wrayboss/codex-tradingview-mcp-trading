# Goals

## Active Goal: Autonomous Repo Control

Status: active

Expected result:

- Codex has a durable local control layer for the two main repos.
- Future work can start from exact repo paths, safe commands, runbooks, and current evidence rather than memory alone.
- Repo-local work remains compatible with each repo's own `AGENTS.md`.

Allowed side effects:

- Create and update files under `agent-control/` in this workspace.
- Read both repos to refresh command inventories and safety rules.
- Do not modify either main repo for this control-layer setup unless the user explicitly asks.

Verification evidence:

- `agent-control/` files exist.
- `repos.yaml` lists both repo roots and observed Git state.
- `evidence/latest-status.md` records the commands used to observe current state.

Stop condition:

- The control layer is present, readable, and references both repos with practical runbooks and validation commands.

## Backlog

- Add a lightweight local browser dashboard for this control layer if a visual goal board becomes useful.
- Add a Cloudflare Tunnel runbook for exposing local dashboards or webhook test servers safely.
- Add an R2 artifact-storage runbook for reports, screenshots, backtests, and exported CSVs.
- Expand the wiki into a Karpathy-style `raw/` plus `wiki/` structure if the user wants source ingestion and synthesis beyond repo-control notes.
- Add recurring automation definitions only when the user asks for scheduled checks, monitors, reminders, or follow-ups.

## Goal Update Protocol

When a goal changes, update this file with:

- what changed,
- why it changed,
- the latest verified evidence,
- the new stop condition.
