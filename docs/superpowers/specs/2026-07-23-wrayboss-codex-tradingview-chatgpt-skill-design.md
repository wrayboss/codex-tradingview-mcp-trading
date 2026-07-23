# Wrayboss Codex TradingView MCP ChatGPT Skill Design

**Date:** 2026-07-23
**Status:** Corrected approved design, pending implementation review
**Owner:** wrayboss
**Target:** Uploadable ChatGPT Skill ZIP

## Purpose

Build an evidence-first ChatGPT Skill for operating and recovering wrayboss's full-access Codex TradingView MCP against the local TradingView Desktop application on the authorized Windows VPS.

The skill must target wrayboss's Codex repository only. It must not silently substitute the Claude repository, the LewisWJackson upstream fork as the primary control plane, browser TradingView, another MCP server, or a reduced-capability path.

The final deliverable is a ZIP archive for manual upload through ChatGPT Skills. It will contain `SKILL.md`, supporting references, deterministic helper scripts, tests, a manifest, hashes, and a verification report.

## Truth contract

Every material claim must use one of these states:

- `YES - EXECUTED AND VERIFIED`
- `NO - CAPABILITY UNAVAILABLE`
- `NOT VERIFIED - EVIDENCE INSUFFICIENT`
- `BLOCKED - DEPENDENCY FAILED`

Tool discovery alone is not proof that a tool works. State-changing actions require before-state, tool output, after-state, and cleanup evidence when applicable.

## Locked runtime identity

The skill is valid only when these identities match:

- Codex repository: `C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading`
- Required origin: `https://github.com/wrayboss/codex-tradingview-mcp-trading.git`
- Codex MCP entry point: `codex-mcp\server.js`
- Full external TradingView MCP: `C:\Users\Administrator\tradingview-mcp\src\server.js`
- Dedicated local application: `C:\Users\Administrator\TradingView-CDP\TradingView.exe`
- CDP endpoint: `http://127.0.0.1:9222`
- Required binding: `CODEX_TRADINGVIEW_MCP_SERVER=C:\Users\Administrator\tradingview-mcp\src\server.js`

The verified combined registry contains 114 tools in the current environment. It includes 34 Codex-native tools plus the non-conflicting full-access TradingView tool surface exposed through the external MCP.

The Claude repository is not an accepted fallback. The LewisWJackson-derived external MCP remains a required low-level dependency for chart automation, but the Codex repository is the sole primary control plane and source of agent policy.

If an identity differs, the agent must stop and report the mismatch. It may inspect GitHub for recovery, but it must never overwrite uncommitted work or replace the Codex repository with another project.

## Local TradingView requirement

All chart operations target the locally running TradingView Desktop application through Chrome DevTools Protocol. A browser tab is not an acceptable substitute.

The protected MSIX executable under `WindowsApps` is not the approved CDP launch target because direct custom-argument execution is blocked. The dedicated `TradingView-CDP` binary is the validated executable.

## ZIP architecture

The archive will contain one top-level folder:

```text
wrayboss-codex-tradingview-mcp/
|-- SKILL.md
|-- references/
|   |-- environment-contract.md
|   |-- tool-catalog.md
|   |-- operator-playbooks.md
|   |-- recovery-playbook.md
|   |-- evidence-and-honesty.md
|   `-- known-limitations.md
|-- scripts/
|   |-- invoke-mcp-tool.ps1
|   |-- verify-environment.ps1
|   `-- run-capability-tests.ps1
`-- tests/
    |-- expected-tools.json
    |-- capability-manifest.json
    `-- verification-report.md
```

`SKILL.md` will stay concise and route agents to the exact reference or script required. The ZIP must exclude secrets, account tokens, cookies, TradingView profile data, screenshots containing sensitive information, `node_modules`, and TradingView binaries.

## Mandatory session preflight

Before any chart mutation, the skill must verify:

1. Remote Desktop Commander reaches the authorized VPS.
2. The Codex repository exists and its origin is exact.
3. The MCP bridge and Node dependencies are present.
4. The external TradingView MCP path exists.
5. The dedicated local TradingView executable exists.
6. CDP port `9222` responds to `/json/version`.
7. A target containing `tradingview.com/chart/` exists.
8. The combined registry contains the expected required tools.
9. `tv_health_check` and `chart_get_state` succeed.
10. Current symbol and timeframe are readable.
11. Screenshot capture succeeds and the file has nonzero size.

Preflight states are `READY`, `DEGRADED`, `NOT VERIFIED`, and `BLOCKED`. Only `READY` permits state-changing chart work. Read-only diagnosis remains permitted in other states.

## Operating scope

The skill covers capabilities that are exposed by the 114-tool registry and are classified by test status:

- Chart state, symbols, timeframes, chart types, visible ranges, panes, layouts, and tabs
- Indicators, watchlists, quotes, OHLCV, depth, Pine-rendered data, and study values
- Levels, trendlines, rectangles, text, drawing inspection, property reads, and precise removal
- Full, chart, and Strategy Tester screenshots
- Pine creation, source injection, compile, error inspection, save, analysis, and attachment
- Strategy Tester summaries, trade and equity reads, backtest validation, and rejection evidence
- Alerts, replay workflows, batch operations, and semantic or UI control
- Deriv account metadata, symbols, candles, research candles, and dry-run evaluation
- Codex-only Deriv EA tools: `deriv_ea_status`, `deriv_ea_doctor`, `deriv_ea_check`, `deriv_ea_quick_check`, and `deriv_ea_backtest_dry`
- Strategy autonomy plans, candidate backtests, research matrices, and Jarvis workflows
- H4/H1 structure, M5 confirmation, markups, and evidence-backed trade-plan analysis when requested

The skill must prefer semantic MCP tools over raw UI operations. Mouse, keyboard, DOM, or arbitrary evaluation tools are fallback mechanisms only when no semantic tool exists or a semantic tool is proven broken.

The skill does not treat discovery as execution. Each tool or category is marked `fully exercised`, `read-only exercised`, `discovery only`, `failed`, or `untested`.

## Evidence requirements

Every state-changing operation must record:

- Requested action and exact MCP tool
- Relevant state before the action
- Raw or faithfully summarized MCP result
- Relevant state after the action
- Artifact path or entity ID when produced
- Cleanup result for temporary verification actions

A drawing is verified only when an entity ID is returned and its presence is confirmed by `draw_list` or a screenshot. Removal is verified only when that ID is absent afterward.

Pine work is verified only when source handling is acknowledged and compile or error inspection returns evidence. Backtest claims require structured or visible Strategy Tester evidence and must identify invalid or insufficient data.

A screenshot is verified only when an MCP path is returned and the file exists with nonzero size.

## Agent operating standard

The agent must follow the user's exact scope, preserve existing chart work, avoid duplicate setup, and resume from the last verified checkpoint after interruptions.

The agent must not clear drawings, remove studies, change layouts, switch symbols, inject Pine, relaunch TradingView, or modify repository files unless the workflow requires it and the impact is stated.

Potentially destructive verification must be reversible. The default mutation test creates one uniquely labeled drawing, confirms it, removes only that entity, and verifies cleanup.

Live financial execution is never inferred from phrases such as "full access." The agent may use a live-trading tool only when the tool is actually implemented, all repository safety gates pass, and the user explicitly authorizes that specific action. Otherwise it must say `NO` or `BLOCKED`.

## Recovery workflow

Recovery proceeds from least destructive to most disruptive:

1. Re-run MCP health and chart-target discovery without changing processes.
2. Verify the Codex repo origin, bridge, external MCP binding, Node runtime, and dependencies.
3. Reuse a healthy CDP session.
4. Start the approved dedicated TradingView binary only when no suitable session exists.
5. Report before terminating an active non-CDP TradingView session.
6. Relaunch only when disruption is authorized or no protected session is at risk.
7. Repair dependencies with the lockfile and record package-manager output.
8. Inspect Git status before repository repair.
9. Fetch or clone only from `wrayboss/codex-tradingview-mcp-trading` when the Codex repo is missing or corrupt.
10. Never overwrite uncommitted work; recover into a separate path when uncertain.

The skill must distinguish transport failure, MCP process failure, external-proxy failure, CDP failure, missing chart target, stale UI, invalid arguments, unsupported capabilities, and safety-gate rejection.

## Test-before-release gate

The ZIP cannot be called verified until a clean test run proves the required identity, transport, read operations, reversible mutations, failure paths, packaging rules, and restoration behavior.

Required live tests include:

- Exact Codex repo and GitHub-origin lock
- Combined MCP discovery with 114 expected tools in the current verified version
- Presence of drawing, Pine, replay, alert, Jarvis, and Deriv EA categories
- CDP health and local chart-target detection
- Chart-state, quote, symbol, and timeframe reads
- Screenshot capture plus file existence and size verification
- Reversible create, list, remove, and cleanup drawing sequence
- Symbol/timeframe mutation only with restoration of original state
- Non-destructive Pine compile or error-path exercise
- Alerts and replay read-only tests where available
- Deriv, Deriv EA, autonomy, and Jarvis read-only workflows
- Invalid endpoint, invalid argument, and unsupported-capability failure tests
- Explicit `NO`, `NOT VERIFIED`, and `BLOCKED` reporting tests
- Proof that the Claude repo and browser TradingView were not used as fallback
- Secret scan, ZIP manifest, hash generation, extraction, and rerun from the extracted package

Any changed chart state must be restored. A state that cannot be safely restored must be declared before the affected test runs.

## Known limitations

A ChatGPT Skill provides instructions, references, and scripts. It does not itself create a new native connector. Successful use depends on Remote Desktop Commander being connected and authorized for the VPS.

A future agent cannot be guaranteed to behave perfectly. The skill instead fails closed, requires evidence, and prohibits success claims without proof.

ChatGPT uploader acceptance remains `NOT VERIFIED` until the user manually uploads the final ZIP successfully.

## Release artifacts

Implementation will produce:

1. `wrayboss-codex-tradingview-mcp.zip` for manual ChatGPT Skills upload.
2. An unpacked source folder for inspection.
3. SHA-256 hashes for the ZIP and executable helper scripts.
4. A file manifest.
5. A verification report with timestamps, environment identity, passed tests, failed tests, and untested capabilities.

The ZIP will be extracted into a clean temporary directory. Validation will confirm that `SKILL.md` is at the skill-folder root, prohibited files are absent, references resolve, and package-local tests run from the extracted copy.

## Acceptance criteria

The work is accepted only when:

- The archive contains one approved skill folder and no unrelated files.
- The skill locks onto `wrayboss/codex-tradingview-mcp-trading` as the primary control plane.
- The skill targets the local TradingView Desktop CDP session only.
- The full combined registry is discovered and required capabilities are tested honestly.
- Temporary mutations are removed and original chart state is restored.
- No secrets, account material, profile data, or proprietary binaries are packaged.
- Recovery instructions fail closed and preserve uncommitted work.
- The final report distinguishes verified, failed, discovery-only, and untested capabilities.

## Out of scope

- Treating the Claude repository as the primary MCP
- Replacing Remote Desktop Commander with a newly deployed network connector
- Packaging TradingView, login state, profile data, or account secrets
- Weakening trading, approval, account, risk, or position safety gates
- Publishing or pushing repository changes without explicit authorization
