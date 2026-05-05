# Trading Jarvis Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-native Trading Jarvis command center that can inspect TradingView state, analyze candles, scan watchlists, prepare strategy/backtest/trade-desk workflows, and write research reports without widening execution.

**Architecture:** Add a pure `src/tradingJarvis.js` module for deterministic command-center, analysis, scanner, strategy-builder, backtest-operator, trade-desk, and journal-report outputs. Add a thin `scripts/jarvis.js` CLI and MCP bridge tools that call the pure module or existing `tvClient`/Deriv tool surfaces. Runtime writes stay under ignored `state/research/reports/`.

**Tech Stack:** Node.js ESM, existing lightweight `tests/run-tests.js` harness, existing Codex MCP bridge, existing Deriv/TradingView symbol registry and indicator modules.

---

### Task 1: Roadmap And Command Center Core

**Files:**
- Create: `src/tradingJarvis.js`
- Modify: `tests/run-tests.js`
- Modify: `docs/codex-strategy-lab.md`
- Modify: `README.md`

- [ ] **Step 1: Write failing tests**

Add tests proving `buildJarvisRoadmap()` lists the seven Jarvis layers and `buildCommandCenter()` returns chart/account/tool state without printing secrets.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test`
Expected: fail with missing `src/tradingJarvis.js`.

- [ ] **Step 3: Implement minimal core**

Create `buildJarvisRoadmap()` and `buildCommandCenter({ chartState, indicators, accountSummary, screenshot })` with research-only safety boundaries and no token fields.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test`
Expected: all tests pass.

### Task 2: Live Chart Analyst

**Files:**
- Modify: `src/tradingJarvis.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Write failing tests**

Add tests for `analyzeChartCandles({ symbol, timeframe, candles, rules })` that detect trend, EMA/RSI/ATR values, setup state, invalidation, and action `watch`, `wait`, or `skip`.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test`
Expected: fail with missing `analyzeChartCandles`.

- [ ] **Step 3: Implement analyst**

Use existing `emaSeries`, `rsiSeries`, and `atrSeries`; keep output descriptive and never execution-approved.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test`
Expected: all tests pass.

### Task 3: Watchlist Scanner

**Files:**
- Modify: `src/tradingJarvis.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Write failing tests**

Add tests for `scanWatchlist({ symbolCandles, rules })` that rank multiple symbols, mark Crash/Boom as research-only, and preserve V75/V50 execution eligibility only.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test`
Expected: fail with missing `scanWatchlist`.

- [ ] **Step 3: Implement scanner**

Call `analyzeChartCandles` per symbol, rank by action and signal score, and return a bounded candidate list.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test`
Expected: all tests pass.

### Task 4: Strategy Builder And Backtest Operator

**Files:**
- Modify: `src/tradingJarvis.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Write failing tests**

Add tests for `buildStrategyBuilderBrief()` and `buildBacktestOperatorChecklist()` that include Pine compile, Strategy Tester export, and `validate-backtest` gates.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test`
Expected: fail with missing functions.

- [ ] **Step 3: Implement workflow builders**

Return exact commands and explicit blockers; do not create approval artifacts.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test`
Expected: all tests pass.

### Task 5: Trade Desk Checklist

**Files:**
- Modify: `src/tradingJarvis.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Write failing tests**

Add tests for `buildTradeDeskChecklist({ explicitExecutionRequest, account, approval, openPositions, env })` that blocks when the request is missing, approval is missing, or open positions exist.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test`
Expected: fail with missing function.

- [ ] **Step 3: Implement fail-closed checklist**

Return gate-by-gate status and final `allowed: false` unless every safety requirement is present.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test`
Expected: all tests pass.

### Task 6: CLI, MCP Tools, And Journal Reports

**Files:**
- Create: `scripts/jarvis.js`
- Modify: `package.json`
- Modify: `codex-mcp/tools.js`
- Modify: `tests/run-tests.js`
- Modify: `README.md`
- Modify: `plugins/trading-jarvis/skills/trading-jarvis/SKILL.md`

- [ ] **Step 1: Write failing tests**

Add tests for `npm.cmd run jarvis -- plan --json`, report writing under `state/research/reports/`, and MCP tools `jarvis_command_center`, `jarvis_analyze_chart`, `jarvis_scan_watchlist`, and `jarvis_trade_desk_check`.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test`
Expected: fail with missing CLI/tools.

- [ ] **Step 3: Implement CLI and MCP wrappers**

Add package script `jarvis`, route commands through pure functions, and write reports only under ignored `state/research/reports/`.

- [ ] **Step 4: Verify green and integration gates**

Run:
- `npm.cmd test`
- `npm.cmd run codex:check`
- `npm.cmd run scan:secrets`
- `git diff --check`

Expected: all commands pass.

### Task 7: PR Delivery

**Files:**
- All above

- [ ] **Step 1: Commit branch**

Run: `git add ...` and `git commit -m "Add Trading Jarvis command center"`.

- [ ] **Step 2: Push and open PR**

Run: `git push -u origin codex/trading-jarvis-command-center` and `gh pr create`.

- [ ] **Step 3: Review and patch if needed**

Inspect PR diff, rerun validation, and patch branch before merge if a defect is found.

- [ ] **Step 4: Merge and refresh**

Merge the PR on GitHub, then run `git fetch origin main` to refresh `origin/main` locally without committing to local `main`.
