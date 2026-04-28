# Codex MCP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-local MCP server that lets Codex inspect TradingView/Deriv and run dry strategy evaluations without changing Claude Code.

**Architecture:** Keep the bridge under `codex-mcp/` with pure, testable tool handlers and a thin stdio MCP server entrypoint. Reuse existing `src/` strategy and Deriv modules, read secrets only from local `.env`, and keep live trading disabled unless `CODEX_ALLOW_LIVE_TRADING=true`.

**Tech Stack:** Node.js ESM, `@modelcontextprotocol/sdk`, existing Deriv WebSocket client, existing strategy modules, existing lightweight test harness.

---

### Task 1: Tool Registry And Secret Boundary

**Files:**
- Create: `codex-mcp/tools.js`
- Modify: `tests/run-tests.js`

- [ ] Write tests that assert the Codex tool list includes health, Deriv candles, account summary, and strategy dry-run tools.
- [ ] Write tests that assert live trade placement is hidden unless explicitly enabled.
- [ ] Implement `createCodexTools()` with dependency injection so tests do not hit network or TradingView.

### Task 2: MCP Server Entry Point

**Files:**
- Create: `codex-mcp/server.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Add `@modelcontextprotocol/sdk`.
- [ ] Implement `ListToolsRequestSchema` and `CallToolRequestSchema` handlers.
- [ ] Add `npm run codex:mcp`.

### Task 3: Local Codex Install Helper

**Files:**
- Create: `codex-mcp/install-codex-config.ps1`
- Modify: `README.md`

- [ ] Add a helper that appends a `[mcp_servers.deriv_trading]` block to `C:\Users\NewAdmin\.codex\config.toml` only when missing.
- [ ] Document manual config fallback.
- [ ] Do not modify any Claude Code config.

### Task 4: Verification

**Files:**
- Modify: `tests/run-tests.js`

- [ ] Run `npm test`.
- [ ] Run `node --check codex-mcp/server.js`.
- [ ] Run `npm run codex:mcp -- --self-test` and verify it starts without requiring a live order flag.
