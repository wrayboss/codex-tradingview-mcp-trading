# Wrayboss Codex TradingView ChatGPT Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, live-test, and package an uploadable ChatGPT Skill ZIP that operates wrayboss's local Codex TradingView MCP control plane and fails closed when evidence is missing.

**Architecture:** The skill uses a concise root `SKILL.md`, focused references, and PowerShell wrappers. The wrappers invoke `codex-mcp/server.js` with `CODEX_TRADINGVIEW_MCP_SERVER` bound to the local full TradingView MCP, verify the local TradingView Desktop CDP session, and return machine-readable evidence. A release script validates the skill structure, scans for prohibited material, extracts the ZIP cleanly, and reruns static validation.

**Tech Stack:** Agent Skills `SKILL.md`, Markdown, PowerShell 5.1+, Node.js 18+, MCP SDK, Windows TradingView Desktop/CDP, Git, ZIP.

## Global Constraints

- Primary repo: `C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading`.
- Required origin: `https://github.com/wrayboss/codex-tradingview-mcp-trading.git`.
- External MCP: `C:\Users\Administrator\tradingview-mcp\src\server.js`.
- TradingView binary: `C:\Users\Administrator\TradingView-CDP\TradingView.exe`.
- CDP endpoint: `http://127.0.0.1:9222`.
- Expected combined registry: exactly 114 tools for the verified revision.
- No fallback to the Claude repo, upstream Jackson repo, browser TradingView, or protected MSIX binary.
- State-changing tests must be reversible and leave zero temporary drawings.
- Status language is limited to YES, NO, NOT VERIFIED, or BLOCKED.
- Never include secrets, cookies, profiles, screenshots, node_modules, or TradingView binaries in the ZIP.

---

### Task 1: Isolated workspace and clean baseline

**Files:**
- Create worktree: `.worktrees/chatgpt-skill-package`
- Create: `docs/superpowers/plans/2026-07-23-chatgpt-skill-package.md`

**Interfaces:**
- Consumes: commit `ace52b8` containing the corrected design.
- Produces: isolated implementation branch with passing repository tests.

- [ ] Verify whether the current checkout is already a linked worktree with `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, and the submodule guard.
- [ ] Ensure `.worktrees/` is ignored; add and commit the ignore only if required.
- [ ] Create branch `codex/chatgpt-skill-package` in `.worktrees/chatgpt-skill-package`.
- [ ] Run `npm install` from the worktree.
- [ ] Run `npm test`, `npm run codex:check`, and `npm run scan:secrets`; stop on any unexplained failure.

### Task 2: RED baseline and package validator

**Files:**
- Create: `skill-package/tests/pressure-scenarios.md`
- Create: `skill-package/tests/validate-skill.ps1`
- Create: `skill-package/tests/expected-tools.json`

**Interfaces:**
- Consumes: verified repo paths and the live 114-tool registry.
- Produces: reproducible baseline failures and a validator that exits nonzero on invalid packages.

- [ ] Record at least three no-skill pressure scenarios: wrong-repo substitution, claiming success from discovery only, and continuing chart mutation after failed preflight.
- [ ] Run the scenarios through an available fresh agent context when possible; otherwise record the harness limitation and use deterministic contract tests rather than claiming behavioral proof.
- [ ] Write `expected-tools.json` with the exact discovered tool names from the Codex MCP.
- [ ] Write `validate-skill.ps1` to require matching folder/frontmatter names, required files, valid relative links, no wrong-repo strings, no placeholder language, and no prohibited binary/runtime material.
- [ ] Run validation against an empty package and verify it fails before skill creation.

### Task 3: MCP invocation and environment verification scripts

**Files:**
- Create: `skill-package/wrayboss-codex-tradingview/scripts/invoke-mcp-tool.ps1`
- Create: `skill-package/wrayboss-codex-tradingview/scripts/mcp-client.mjs`
- Create: `skill-package/wrayboss-codex-tradingview/scripts/verify-environment.ps1`

**Interfaces:**
- `invoke-mcp-tool.ps1 -Tool <string> -ArgumentsJson <json>` returns MCP JSON and preserves nonzero failure status.
- `mcp-client.mjs list` returns the full tool registry; `mcp-client.mjs call <tool> <json>` invokes one tool.
- `verify-environment.ps1` returns JSON with `status`, `checks`, `toolCount`, `symbol`, and `timeframe`.

- [ ] Write failing contract tests for missing repo, wrong origin, missing external MCP, dead CDP, tool-count mismatch, and invalid JSON arguments.
- [ ] Implement `mcp-client.mjs` using `@modelcontextprotocol/sdk/client` and `StdioClientTransport`, with the Codex server as the only primary server.
- [ ] Implement `invoke-mcp-tool.ps1` with strict argument validation and no `Invoke-Expression`.
- [ ] Implement `verify-environment.ps1` with fail-closed `READY`, `DEGRADED`, `NOT VERIFIED`, and `BLOCKED` states.
- [ ] Run all contract tests and verify each expected failure is classified accurately.

### Task 4: Main skill and focused references

**Files:**
- Create: `skill-package/wrayboss-codex-tradingview/SKILL.md`
- Create: `references/environment-contract.md`
- Create: `references/evidence-and-honesty.md`
- Create: `references/operator-playbooks.md`
- Create: `references/recovery-playbook.md`
- Create: `references/tool-catalog.md`
- Create: `references/known-limitations.md`

**Interfaces:**
- `SKILL.md` routes agents to the relevant reference and mandates preflight before mutation.
- References define exact commands, evidence, cleanup, and stop conditions.

- [ ] Use frontmatter name `wrayboss-codex-tradingview` matching the parent folder.
- [ ] Start the description with `Use when...` and include local TradingView, Codex MCP, markups, Pine, replay, alerts, Deriv research, recovery, and port 9222 triggers.
- [ ] Encode the hard identity lock, four status values, no-fallback rule, reversible-test rule, and explicit live-trading restrictions.
- [ ] Add a quick-reference matrix mapping tasks to semantic MCP tools and proof requirements.
- [ ] Add one complete example showing preflight, chart read, temporary drawing, exact removal, and final evidence report.

### Task 5: Live capability tests and verification report

**Files:**
- Create: `skill-package/wrayboss-codex-tradingview/scripts/run-capability-tests.ps1`
- Create: `skill-package/wrayboss-codex-tradingview/tests/capability-manifest.json`
- Create: `skill-package/wrayboss-codex-tradingview/tests/verification-report.md`

**Interfaces:**
- `run-capability-tests.ps1` performs read-only checks by default and uses `-ReversibleMarkupTest` for one temporary drawing.
- `capability-manifest.json` classifies each capability as fully exercised, read-only exercised, discovery-only, failed, or untested.

- [ ] Capture original chart symbol, timeframe, and drawing list.
- [ ] Verify 114-tool discovery, CDP health, chart state, quote read, and screenshot file existence.
- [ ] Create a uniquely labeled temporary text drawing, confirm its entity ID, list it, remove only that ID, and confirm it is absent.
- [ ] Verify Pine, replay, alerts, Jarvis, and five Deriv EA tools are discoverable; run only safe read-only calls whose schemas and prerequisites are known.
- [ ] Test invalid tool and invalid endpoint paths and verify explicit error status rather than false success.
- [ ] Restore any changed chart state and record all outputs in `verification-report.md`.

### Task 6: GREEN and REFACTOR skill-behavior tests

**Files:**
- Modify: `skill-package/tests/pressure-scenarios.md`
- Modify: `skill-package/wrayboss-codex-tradingview/SKILL.md`
- Modify: `references/evidence-and-honesty.md`

**Interfaces:**
- Test scenarios score repository identity, preflight discipline, evidence quality, cleanup, and truthful refusal.

- [ ] Re-run the same pressure scenarios with the skill available in a fresh agent context when supported.
- [ ] Verify the agent refuses the Claude repo and upstream fork, does not mutate on failed preflight, and never promotes discovery-only evidence to executed status.
- [ ] Record any rationalizations or loopholes verbatim.
- [ ] Add only the minimal counters needed to close observed loopholes.
- [ ] Re-run tests; if fresh-agent execution is unavailable, mark behavioral compliance `NOT VERIFIED` and keep deterministic package/script results separate.

### Task 7: Build and validate the upload ZIP

**Files:**
- Create: `skill-package/build-skill-zip.ps1`
- Create: `skill-package/MANIFEST.sha256`
- Produce: `dist/wrayboss-codex-tradingview.zip`

**Interfaces:**
- `build-skill-zip.ps1` validates, scans, archives one root skill folder, extracts to a clean temp directory, and validates the extracted copy.

- [ ] Run the repository secret scanner and package-specific prohibited-file scanner.
- [ ] Validate YAML frontmatter, skill-folder name, required resources, expected tool manifest, and all relative references.
- [ ] Create the ZIP containing exactly one root folder named `wrayboss-codex-tradingview`.
- [ ] Extract the ZIP to a new empty directory and rerun static validation from the extracted copy.
- [ ] Compute SHA-256 for the ZIP and all executable scripts.
- [ ] Confirm the ZIP contains no `.env`, token, cookie, screenshot, profile, `node_modules`, or TradingView executable.

### Task 8: Final verification and artifact handoff

**Files:**
- Modify: `tests/verification-report.md`
- Produce local handoff copy: `/mnt/data/wrayboss-codex-tradingview.zip`

**Interfaces:**
- Final response reports only fresh evidence and provides the downloadable ZIP.

- [ ] Run `npm test`, `npm run codex:check`, and `npm run scan:secrets` from the implementation worktree.
- [ ] Run package validation and live capability tests one final time.
- [ ] Inspect `git diff --check`, `git status`, ZIP listing, extracted folder, and SHA-256 output.
- [ ] Copy the verified ZIP to the chat artifact directory without modifying its bytes.
- [ ] State `NOT VERIFIED` for ChatGPT uploader acceptance until the user completes the manual upload and scan.
- [ ] Commit the implementation branch without pushing unless the user explicitly requests a push.
