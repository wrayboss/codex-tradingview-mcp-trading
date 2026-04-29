/**
 * Integration tests for src/cycle.js
 *
 * All tests use a mocked DerivClient — no network calls.
 * Exported so run-tests.js can register them.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync, rmSync } from "fs";
import { runCycle, reconcileUnsettled, placeOrderWithRetry } from "../src/cycle.js";
import { monitorContract } from "../src/contractMonitor.js";
import { RiskManager } from "../src/riskManager.js";
import { loadRules }   from "../src/rulesLoader.js";

const rules   = loadRules("./rules.json");
const TMPDIR  = "state-test-tmp";

// ─── Candle factories ──────────────────────────────────────────────────────────
function nowSec() { return Math.floor(Date.now() / 1000); }

/**
 * N flat LTF candles fully in the past (filterInProgress keeps all of them).
 * price=985, range=1 → no breakout possible.
 */
function flatLtfCandles(n = 60) {
  const now = nowSec();
  return Array.from({ length: n }, (_, i) => ({
    epoch: now - 900 * (n - i + 1), // all closed
    open: 985, high: 985.5, low: 984.5, close: 985,
  }));
}

/**
 * Minimal HTF candles with no pivot (all flat).
 */
function flatHtfCandles(n = 20) {
  const now = nowSec();
  return Array.from({ length: n }, (_, i) => ({
    epoch: now - 3600 * (n - i + 1),
    open: 985, high: 985.5, low: 984.5, close: 985,
  }));
}

/**
 * HTF candles with a confirmed pivot high at 1000 (position 5 confirmed at position 10).
 * pivot_left=5, pivot_right=5 → confirmed at index 10.
 */
function htfWithPivot() {
  const now = nowSec();
  // 14 bars, each 3600s apart, all closed
  const highs = [990, 991, 989, 990, 988, 1000, 992, 991, 990, 991, 992, 993, 994, 993];
  const lows  = [985, 986, 984, 985, 983,  990, 986, 985, 984, 985, 986, 987, 988, 987];
  return highs.map((h, i) => ({
    epoch: now - 3600 * (15 - i), // bar 13 epoch = now-7200 (closed)
    open: lows[i] + 2, high: h, low: lows[i], close: lows[i] + 2,
  }));
}

/**
 * 60 LTF candles designed to fire a LONG signal on bar 59 (lastIdx):
 *
 *  bars 0–56 : flat at 985  (EMA50≈985, RSI=100 due to avgLoss=0, ATR≈1)
 *  bar 57    : breakout — close=1025, high=1026, low=984.5 (range=41.5)
 *               → detected against resistance at 1000 (from htfWithPivot)
 *  bar 58    : above zone — close=1010, range=1
 *  bar 59    : retest + confirmation — low=999.8 (touches 1000), close=1006
 *               body=5, range=6.7, bodyPct=74.6% (strong bull)
 *               EMA50≈988.7 < 1006 ✓   RSI≈65.8 > 50 ✓
 */
function signalLtfCandles() {
  const now = nowSec();
  const candles = Array.from({ length: 60 }, (_, i) => ({
    epoch: now - 900 * (61 - i), // all closed: bar 59 epoch = now-1800
    open: 985, high: 985.5, low: 984.5, close: 985,
  }));

  // bar 57 — breakout
  candles[57] = { epoch: candles[57].epoch, open: 985, close: 1025, high: 1026, low: 984.5 };
  // bar 58 — above zone
  candles[58] = { epoch: candles[58].epoch, open: 1010, close: 1010, high: 1010.5, low: 1009.5 };
  // bar 59 — retest + strong bull confirmation
  candles[59] = { epoch: candles[59].epoch, open: 1001, close: 1006, high: 1006.5, low: 999.8 };

  return candles;
}

// ─── Mock client factory ───────────────────────────────────────────────────────
function makeMockClient({
  ltfCandles    = flatLtfCandles(),
  htfCandles    = flatHtfCandles(),
  openPositions = [],
  proposalId    = "P123",
  contractId    = "C456",
  buyFails      = 0,    // throw this many times before succeeding
  settled       = true,
  profit        = 5,
} = {}) {
  let buyAttempts = 0;
  const calls     = { buy: 0, proposal: 0, contractStatus: 0, openPositions: 0 };
  const client    = {
    _calls: calls,
    connect:       async () => {},
    authorize:     async () => ({ email: "test@test.com", is_virtual: true, currency: "USD", balance: 1000 }),
    candles:       async ({ granularity }) => granularity >= 3600 ? htfCandles : ltfCandles,
    openPositions: async () => { calls.openPositions++; return openPositions; },
    proposal:      async () => { calls.proposal++; return { proposal: { id: proposalId } }; },
    buy:           async () => {
      calls.buy++;
      buyAttempts++;
      if (buyAttempts <= buyFails) throw Object.assign(new Error("InternalServerError"), { code: "InternalServerError" });
      return { buy: { contract_id: contractId } };
    },
    contractStatus: async () => {
      calls.contractStatus++;
      return { proposal_open_contract: { is_sold: settled, profit } };
    },
    close: () => {},
  };
  return () => client; // clientFactory signature: (config) => client
}

// ─── Shared risk + config ──────────────────────────────────────────────────────
function makeRisk(logFile = `${TMPDIR}-risk-log.json`) {
  const r = new RiskManager(rules.risk, { logFile });
  r.history = { trades: [] };
  return r;
}

const baseConfig = {
  symbol: "VOLATILITY_75", derivSymbol: "R_75",
  stakeUsd: 10, multiplier: 10,
  apiToken: "demo_token", appId: "1089",
};

// Approved backtest file written to tmpDir for live-mode tests
function approvedBacktest(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/backtest-approved.json`, JSON.stringify({ approved: true }));
}

function notApprovedBacktest(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/backtest-approved.json`, JSON.stringify({ approved: false }));
}

function cleanTmp(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ─── Tests ────────────────────────────────────────────────────────────────────
export const integrationTests = [

  // Guard: not enough LTF bars
  {
    name: "EMA guard — cycle exits early when LTF < 51 bars",
    async run(eq, truthy) {
      const dir  = `${TMPDIR}-ema`;
      try {
        const risk   = makeRisk();
        const factory = makeMockClient({ ltfCandles: flatLtfCandles(40) });
        const result = await runCycle(baseConfig, rules, risk, {
          dryRun: true, monitorSettlement: false,
          stateDir: dir, clientFactory: factory,
        });
        eq("returns undefined on EMA guard", result, undefined);
        eq("buy never called", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // Guard: backtest not approved in live mode
  {
    name: "backtest gate — blocks live order when not approved",
    async run(eq, truthy) {
      const dir = `${TMPDIR}-bt`;
      try {
        notApprovedBacktest(dir);
        const risk    = makeRisk();
        const factory = makeMockClient({ ltfCandles: flatLtfCandles(60) });
        const result  = await runCycle(baseConfig, rules, risk, {
          dryRun: false, monitorSettlement: false,
          stateDir: dir, clientFactory: factory,
        });
        eq("returns undefined when gate blocked", result, undefined);
        eq("buy never called", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // Guard: open position in portfolio
  {
    name: "open position check — blocks new entry",
    async run(eq, truthy) {
      const dir = `${TMPDIR}-pos`;
      try {
        approvedBacktest(dir);
        const existing = [{ contract_id: "OPEN1", contract_type: "MULTUP", symbol: "R_75" }];
        const risk     = makeRisk();
        const factory  = makeMockClient({ ltfCandles: flatLtfCandles(60), openPositions: existing });
        const result   = await runCycle(baseConfig, rules, risk, {
          dryRun: false, monitorSettlement: false,
          stateDir: dir, clientFactory: factory,
        });
        eq("returns undefined when position open", result, undefined);
        eq("buy never called", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // No signal — flat candles, dry-run
  {
    name: "no signal — flat candles return NO_SIGNAL mode",
    async run(eq, truthy) {
      const dir = `${TMPDIR}-nosig`;
      try {
        const risk    = makeRisk();
        const factory = makeMockClient({ ltfCandles: flatLtfCandles(60), htfCandles: flatHtfCandles(20) });
        const result  = await runCycle(baseConfig, rules, risk, {
          dryRun: true, monitorSettlement: false,
          stateDir: dir, clientFactory: factory,
        });
        truthy("result is an object", result != null && typeof result === "object");
        eq("mode is DRY_RUN (dry-run always reports DRY_RUN)", result?.mode, "DRY_RUN");
        eq("orderPlaced is false", result?.orderPlaced, false);
        eq("buy never called", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // Signal fires — crafted candles, dry-run confirms no buy
  {
    name: "dry-run never calls buy even with valid signal",
    async run(eq, truthy) {
      const dir = `${TMPDIR}-drysig`;
      try {
        const risk    = makeRisk();
        const factory = makeMockClient({ ltfCandles: signalLtfCandles(), htfCandles: htfWithPivot() });
        const result  = await runCycle(baseConfig, rules, risk, {
          dryRun: true, monitorSettlement: false,
          stateDir: dir, clientFactory: factory,
        });
        truthy("result returned", result != null);
        eq("mode is DRY_RUN", result?.mode, "DRY_RUN");
        eq("orderPlaced false in dry-run", result?.orderPlaced, false);
        eq("buy never called in dry-run", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // Signal fires — live mode, order placed
  {
    name: "signal fires — order placed in live mode",
    async run(eq, truthy) {
      const dir = `${TMPDIR}-live`;
      try {
        approvedBacktest(dir);
        const risk    = makeRisk();
        const factory = makeMockClient({ ltfCandles: signalLtfCandles(), htfCandles: htfWithPivot() });
        const result  = await runCycle(baseConfig, rules, risk, {
          dryRun: false, monitorSettlement: false,
          stateDir: dir, clientFactory: factory,
        });
        truthy("result returned", result != null);
        eq("mode is LIVE", result?.mode, "LIVE");
        eq("orderPlaced is true", result?.orderPlaced, true);
        eq("contractId set", result?.contractId, "C456");
        eq("side is long", result?.side, "long");
        truthy("proposal called", factory()._calls.proposal > 0);
        eq("buy called once", factory()._calls.buy, 1);
      } finally { cleanTmp(dir); }
    },
  },

  // placeOrderWithRetry — succeeds first attempt
  {
    name: "placeOrderWithRetry — succeeds on first attempt",
    async run(eq, truthy) {
      const client = makeMockClient()();
      const result = await placeOrderWithRetry(
        client,
        { symbol: "R_75", contractType: "MULTUP", amount: 10, multiplier: 10, slUsd: 3, tpUsd: 6 },
        10
      );
      eq("buy called once", client._calls.buy, 1);
      eq("returns contract_id", result.order.buy.contract_id, "C456");
    },
  },

  // placeOrderWithRetry — fails once, then succeeds
  {
    name: "placeOrderWithRetry — retries after one failure",
    async run(eq, truthy) {
      const client = makeMockClient({ buyFails: 1 })();
      const result = await placeOrderWithRetry(
        client,
        { symbol: "R_75", contractType: "MULTUP", amount: 10, multiplier: 10, slUsd: 3, tpUsd: 6 },
        10,
        3   // maxAttempts
      );
      eq("buy called twice (1 fail + 1 success)", client._calls.buy, 2);
      eq("still returns correct contractId", result.order.buy.contract_id, "C456");
    },
  },

  // placeOrderWithRetry — exhausts all attempts
  {
    name: "placeOrderWithRetry — throws after all attempts exhausted",
    async run(eq, truthy) {
      const client = makeMockClient({ buyFails: 99 })();
      let threw = false;
      try {
        await placeOrderWithRetry(
          client,
          { symbol: "R_75", contractType: "MULTUP", amount: 10, multiplier: 10, slUsd: 3, tpUsd: 6 },
          10,
          2   // maxAttempts = 2
        );
      } catch { threw = true; }
      eq("threw after max attempts", threw, true);
      eq("buy called exactly maxAttempts times", client._calls.buy, 2);
    },
  },

  // reconcileUnsettled — updates settled contracts
  {
    name: "reconcileUnsettled — marks settled contract as win",
    async run(eq, truthy) {
      const risk = makeRisk();
      const trade = {
        contractId: "C789", orderPlaced: true, outcome: null, pnl_usd: null,
        timestamp: new Date().toISOString(), epoch: 0,
      };
      risk.history.trades.push(trade);

      const client = {
        contractStatus: async () => ({ proposal_open_contract: { is_sold: true, profit: 7.5 } }),
      };

      await reconcileUnsettled(risk, client);
      eq("outcome updated to win", trade.outcome, "win");
      eq("pnl_usd set correctly", trade.pnl_usd, 7.5);
    },
  },

  {
    name: "monitorContract — records string Deriv profit and settlement CSV row",
    async run(eq, truthy) {
      const dir = `${TMPDIR}-monitor`;
      const logFile = `${dir}/safety-check-log.json`;
      const csvFile = `${dir}/trades.csv`;
      try {
        mkdirSync(dir, { recursive: true });
        const risk = makeRisk(logFile);
        const decision = {
          timestamp: "2026-04-28T12:00:00.000Z",
          symbol: "VOLATILITY_75",
          side: "long",
          stakeUsd: 10,
          multiplier: 10,
          slUsd: 3,
          tpUsd: 6,
          contractId: "C777",
          mode: "LIVE",
          orderPlaced: true,
          outcome: null,
          pnl_usd: null,
          notes: "Filled @ proposal P777",
        };
        risk.recordDecision(decision);

        const client = {
          contractStatus: async () => ({ proposal_open_contract: { is_sold: true, profit: "7.50" } }),
        };

        const result = await monitorContract(client, "C777", decision, risk, {
          pollMs: 0,
          timeoutMs: 1000,
          settlementCsvFile: csvFile,
          nowFn: () => new Date("2026-04-28T12:05:00.000Z"),
        });

        eq("settlement outcome is win", result.outcome, "win");
        eq("settlement pnl is numeric", result.pnl, 7.5);
        const saved = JSON.parse(readFileSync(logFile, "utf8"));
        eq("history saved numeric pnl", saved.trades[0].pnl_usd, 7.5);
        const csv = readFileSync(csvFile, "utf8");
        truthy("settlement row includes SETTLE mode", csv.includes(",SETTLE,win,7.50,"));
      } finally { cleanTmp(dir); }
    },
  },

  // Session gate — blocks outside window
  {
    name: "session gate — blocks cycle when outside UTC trading window",
    async run(eq, truthy) {
      const dir          = `${TMPDIR}-sess-off`;
      try {
        const sessionRules = { ...rules, session: { utc_start_hour: 10, utc_end_hour: 18 } };
        const factory      = makeMockClient({ ltfCandles: flatLtfCandles(60) });
        const nowFn        = () => new Date(Date.UTC(2026, 0, 1, 3, 0, 0)); // 03:00 UTC
        const result       = await runCycle(baseConfig, sessionRules, makeRisk(), {
          dryRun: true, monitorSettlement: false,
          stateDir: dir, clientFactory: factory, nowFn,
        });
        eq("returns undefined when outside session", result, undefined);
        eq("buy never called", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // Session gate — passes inside window
  {
    name: "session gate — passes through when inside UTC trading window",
    async run(eq, truthy) {
      const dir          = `${TMPDIR}-sess-on`;
      try {
        const sessionRules = { ...rules, session: { utc_start_hour: 10, utc_end_hour: 18 } };
        const factory      = makeMockClient({ ltfCandles: flatLtfCandles(60), htfCandles: flatHtfCandles(20) });
        const nowFn        = () => new Date(Date.UTC(2026, 0, 1, 14, 0, 0)); // 14:00 UTC
        const result       = await runCycle(baseConfig, sessionRules, makeRisk(), {
          dryRun: true, monitorSettlement: false,
          stateDir: dir, clientFactory: factory, nowFn,
        });
        truthy("cycle returns a decision object (not undefined)", result != null && typeof result === "object");
        eq("buy never called (no signal)", factory()._calls.buy, 0);
      } finally { cleanTmp(dir); }
    },
  },

  // reconcileUnsettled — skips still-open contracts
  {
    name: "reconcileUnsettled — skips contracts that are still open",
    async run(eq, truthy) {
      const risk = makeRisk();
      const trade = {
        contractId: "C999", orderPlaced: true, outcome: null, pnl_usd: null,
        timestamp: new Date().toISOString(), epoch: 0,
      };
      risk.history.trades.push(trade);

      const client = {
        contractStatus: async () => ({ proposal_open_contract: { is_sold: false, profit: 0 } }),
      };

      await reconcileUnsettled(risk, client);
      eq("outcome remains null for open contract", trade.outcome, null);
    },
  },

];
