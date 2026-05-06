// Lightweight test harness: no jest, no mocha. Run: npm test
import { integrationTests } from "./integration.js";
import { backtestValidatorTests } from "./backtestValidator.js";
import { gitRemotePreflightTests } from "./gitRemotePreflight.js";
import { emaSeries, rsiSeries, atrSeries, smaSeries, pivotHighAt, pivotLowAt } from "../src/indicators.js";
import { filterInProgress } from "../src/candleUtils.js";
import { existsSync, unlinkSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { findPivots } from "../src/pivots.js";
import { LevelStore } from "../src/levels.js";
import { detectBreakouts } from "../src/breakoutDetector.js";
import { RetestTracker } from "../src/retestTracker.js";
import { evaluateConfirmation } from "../src/confirmation.js";
import { evaluateTrendFilter } from "../src/trendFilter.js";
import { RiskManager } from "../src/riskManager.js";
import { CSV_HEADERS, SAFETY_LOG_SCHEMA_VERSION, prepareRuntimeArtifacts, appendSettlementCsvRowOnce, hasSettlementCsvRow } from "../src/artifacts.js";
import { getDerivTradeConstraints, resolveMultiplierForSymbol, validateDerivTradeSize } from "../src/tradeConstraints.js";
import { getOperatorWatchlist, resolveActiveWatchlist, resolveOperatorSymbol } from "../src/watchlist.js";
import { createCodexTools, normalizeSyntheticSymbol, normalizeTradingViewSyntheticSymbol } from "../codex-mcp/tools.js";
import { buildRuntimeHealthReport } from "../src/runtimeHealth.js";
import { formatErrorMessage } from "../src/runtimeWarnings.js";
import {
  getResearchSymbolCatalog,
  normalizeDerivResearchSymbol,
  resolveResearchSymbol,
  toTradingViewSymbol,
} from "../src/derivSymbolRegistry.js";
import {
  backtestCandidateSet,
  buildAutonomyPlan,
  buildAutonomyStatus,
  generateStrategyCandidates,
  loadCandlePayload,
  rankBacktestResults,
} from "../src/strategyAutonomy.js";
import {
  analyzeChartCandles,
  buildBacktestOperatorChecklist,
  buildCommandCenter,
  buildJarvisRoadmap,
  buildMorningBriefPlan,
  buildStrategyBuilderBrief,
  buildTradeDeskChecklist,
  scanWatchlist,
  writeJarvisReport,
} from "../src/tradingJarvis.js";
import { scanRepo } from "../scripts/scan-secrets.js";
import { createDecisionId, createOrderFilledEventId, createSettlementId } from "../src/tradeIdentity.js";
import { appendTradeEventOnce, loadTradeEvents, hasTradeEvent, TRADE_EVENT_SCHEMA_VERSION } from "../src/tradeJournal.js";

let pass = 0, fail = 0;
const failures = [];

function eq(label, actual, expected, tol = 1e-6) {
  const ok = typeof expected === "number"
    ? Math.abs(actual - expected) < tol
    : actual === expected;
  if (ok) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push({ label, actual, expected }); console.log(`  FAIL ${label} - got ${actual}, expected ${expected}`); }
}

function truthy(label, actual) {
  if (actual) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push({ label, actual, expected: "truthy" }); console.log(`  FAIL ${label} - got ${actual}`); }
}

async function group(name, fn) {
  console.log(`\n-- ${name} --`);
  await fn();
}

// Candle freshness filter
await group("candle freshness", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const gran = 900; // 15m

  // Last candle still open (epoch + gran > now)
  const openLast = [
    { epoch: nowSec - gran * 2, close: 1 },
    { epoch: nowSec - gran,     close: 2 },
    { epoch: nowSec - 60,       close: 3 }, // started 60s ago, not yet closed
  ];
  const filtered = filterInProgress(openLast, gran);
  eq("drops in-progress last candle", filtered.length, 2);
  eq("keeps prior candle intact", filtered.at(-1).close, 2);

  // Last candle already closed (epoch + gran <= now)
  const closedLast = [
    { epoch: nowSec - gran * 2, close: 1 },
    { epoch: nowSec - gran - 1, close: 2 }, // closed at least 1s ago
  ];
  const unfiltered = filterInProgress(closedLast, gran);
  eq("keeps fully closed last candle", unfiltered.length, 2);

  // Empty array
  eq("handles empty array", filterInProgress([], gran).length, 0);
});

// Indicators
await group("indicators", () => {
  // SMA flat series: mean equals value.
  const flat = Array(20).fill(10);
  eq("sma flat", smaSeries(flat, 5)[19], 10);

  // EMA on constant series: equals constant.
  eq("ema flat", emaSeries(flat, 5)[19], 10);

  // EMA on simple linear series
  const linear = Array.from({ length: 30 }, (_, i) => i + 1);
  const e = emaSeries(linear, 10);
  truthy("ema linear monotonic increasing", e[29] > e[28] && e[28] > e[27]);

  // RSI on monotonically increasing series: 100.
  const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
  eq("rsi rising = 100", rsiSeries(rising, 14)[29], 100);

  // RSI on monotonically decreasing series: 0.
  const falling = Array.from({ length: 30 }, (_, i) => 200 - i);
  eq("rsi falling = 0", rsiSeries(falling, 14)[29], 0);

  // ATR on candles where each bar has range = 1, no gaps: 1.
  const candles = Array.from({ length: 30 }, (_, i) => ({
    epoch: i, open: i, high: i + 0.5, low: i - 0.5, close: i,
  }));
  const a = atrSeries(candles, 14);
  truthy("atr ~ stable", Math.abs(a[29] - 1) < 0.5);
});

// Pivots
await group("pivots", () => {
  // Triangle: bar 5 is the peak
  const highs = [1, 2, 3, 4, 5, 10, 5, 4, 3, 2, 1];
  // pivothigh(2, 2): peak at idx 5, confirmed at idx 7
  eq("pivot high detected at confirmation", pivotHighAt(highs, 7, 2, 2), 10);
  eq("pivot high not yet confirmed", pivotHighAt(highs, 6, 2, 2), null);

  const lows = [10, 9, 8, 7, 1, 7, 8, 9, 10];
  eq("pivot low detected", pivotLowAt(lows, 6, 2, 2), 1);

  // findPivots integration
  const candles = highs.map((h, i) => ({ epoch: i * 60, high: h, low: lows[i] ?? h - 1, open: h, close: h }));
  const p = findPivots(candles, 2, 2);
  truthy("findPivots returns highs", p.highs.length >= 1);
});

// Confirmation candle
await group("confirmation", () => {
  const rules = { min_body_pct: 0.6, allow_pin_bar: true, allow_engulfing: true };

  const strongBull = { open: 100, close: 110, high: 110.5, low: 99.5 };
  const prev = { open: 105, close: 100, high: 106, low: 99 };
  const r1 = evaluateConfirmation(strongBull, prev, rules);
  truthy("strong-body bull passes long", r1.pass.long);
  eq("strong-body bull does not pass short", r1.pass.short, false);

  const bullPin = { open: 100, close: 101, high: 101.5, low: 95 };
  const r2 = evaluateConfirmation(bullPin, prev, rules);
  truthy("bull pin bar passes long", r2.pass.long);

  const bullEng = { open: 99.5, close: 106, high: 106.2, low: 99.4 };
  const prev2 = { open: 105, close: 100, high: 105.5, low: 99.8 };
  const r3 = evaluateConfirmation(bullEng, prev2, rules);
  truthy("bull engulfing passes long", r3.pass.long);

  const noise = { open: 100, close: 100.1, high: 102, low: 98 };
  const r4 = evaluateConfirmation(noise, prev, rules);
  eq("indecision does not pass long", r4.pass.long, false);
});

// Trend filter
await group("trend filter", () => {
  const rules = { ema_required: true, rsi_long_min_entry: 50, rsi_short_max_entry: 50 };
  truthy("long pass when price>EMA & rsi>50", evaluateTrendFilter(110, 100, 60, "long", rules).pass);
  eq("long fail when price<EMA", evaluateTrendFilter(95, 100, 60, "long", rules).pass, false);
  eq("long fail when rsi<50", evaluateTrendFilter(110, 100, 40, "long", rules).pass, false);
  truthy("short pass when price<EMA & rsi<50", evaluateTrendFilter(90, 100, 40, "short", rules).pass);
});

// Levels
await group("levels", () => {
  const ls = new LevelStore();
  ls.ingest({
    highs: [{ epoch: 100, confirmedAt: 200, price: 50 }],
    lows:  [{ epoch: 150, confirmedAt: 250, price: 40 }],
  });
  const aBefore = ls.activeAt(199);
  eq("level not active before confirmation", aBefore.resistances.length, 0);
  const aAfter = ls.activeAt(200);
  eq("resistance active at confirmation", aAfter.resistances.length, 1);
  ls.markBroken("R:100:50");
  eq("broken level filtered out", ls.activeAt(300).resistances.length, 0);

  const pruned = new LevelStore({ maxActive: 2, ttlSeconds: 3600 });
  pruned.ingest({
    highs: [
      { epoch: 0, confirmedAt: 0, price: 10 },
      { epoch: 60, confirmedAt: 60, price: 11 },
      { epoch: 120, confirmedAt: 120, price: 12 },
    ],
    lows: [],
  });
  eq("max active resistances keeps newest levels", pruned.activeAt(120).resistances.length, 2);
  eq("old levels expire by ttl", pruned.activeAt(3900).resistances.length, 0);
});

// Breakout detector
await group("breakouts", () => {
  const rules = {
    min_close_distance_atr: 0.25,
    min_range_multiplier: 1.2,
    rsi_long_min: 55,
    rsi_short_max: 45,
  };
  const active = {
    resistances: [{ price: 100, key: "R:1:100" }],
    supports:    [{ price: 50,  key: "S:2:50"  }],
  };

  // Strong bull break
  const c1 = { epoch: 1000, open: 99, close: 102, high: 102.5, low: 98.8 };
  const b1 = detectBreakouts(c1, active, 1.0, 60, 1.0, rules);
  eq("bull break detected", b1.length, 1);
  eq("bull break side", b1[0]?.side, "long");

  // Close not far enough past level
  const c2 = { epoch: 1000, open: 99, close: 100.1, high: 100.3, low: 98.8 };
  const b2 = detectBreakouts(c2, active, 1.0, 60, 1.0, rules);
  eq("weak break rejected (close distance)", b2.length, 0);

  // Range too small
  const c3 = { epoch: 1000, open: 101, close: 102, high: 102.1, low: 100.9 };
  const b3 = detectBreakouts(c3, active, 1.0, 60, 1.0, rules);
  eq("weak break rejected (range)", b3.length, 0);

  // RSI fails
  const c4 = { epoch: 1000, open: 99, close: 102, high: 102.5, low: 98.8 };
  const b4 = detectBreakouts(c4, active, 1.0, 50, 1.0, rules);
  eq("bull break rejected (rsi)", b4.length, 0);

  const drifting = [
    { close: 100.2 },
    { close: 100.4 },
    { close: 100.8 },
  ];
  const b5 = detectBreakouts(c1, active, 1.0, 60, 1.0, rules, drifting);
  eq("bull break rejected after three prior closes above level", b5.length, 0);
});

// Retest tracker
await group("retest tracker", () => {
  const rules = {
    max_bars_after_break: 6,
    tolerance_atr: 0.3,
    invalidation_atr: 0.5,
  };
  const tr = new RetestTracker(rules);
  tr.start({ side: "long", level: 100, levelKey: "R:1:100", atrAtBreak: 1.0, breakEpoch: 1000 });

  // bar after break: price still elevated, no retest yet
  const e1 = tr.advance({ epoch: 1900, open: 102, close: 102.5, high: 103, low: 101.5 }, 1.0);
  eq("no retest while above zone", e1.length, 0);

  // bar 2: price wicks down to level
  const e2 = tr.advance({ epoch: 2800, open: 101, close: 102, high: 102.2, low: 100.1 }, 1.0);
  eq("retest event when low touches zone", e2.length, 1);
  eq("retest event side", e2[0]?.side, "long");

  const trWindow = new RetestTracker({ ...rules, max_bars_to_confirm: 2 });
  trWindow.start({ side: "long", level: 100, levelKey: "R:1:100", atrAtBreak: 1.0, breakEpoch: 0 });
  trWindow.advance({ epoch: 900, open: 102, close: 102, high: 103, low: 101 }, 1.0);
  const touch = trWindow.advance({ epoch: 1800, open: 101, close: 101.5, high: 102, low: 100.1 }, 1.0);
  const followup = trWindow.advance({ epoch: 2700, open: 101.5, close: 102, high: 102.2, low: 101.2 }, 1.0);
  trWindow.advance({ epoch: 3600, open: 102, close: 102.1, high: 102.3, low: 101.5 }, 1.0);
  eq("retest emits first touch", touch.length, 1);
  eq("retest emits one follow-up confirmation bar", followup.length, 1);
  eq("retest tracker drops after confirmation window", trWindow.tracking.length, 0);

  // Invalidation: deep close back through level
  const tr2 = new RetestTracker(rules);
  tr2.start({ side: "long", level: 100, levelKey: "R:1:100", atrAtBreak: 1.0, breakEpoch: 0 });
  tr2.advance({ epoch: 900, open: 102, close: 102, high: 103, low: 101 }, 1.0);
  tr2.advance({ epoch: 1800, open: 100, close: 99, high: 100.2, low: 98 }, 1.0);
  eq("invalidated tracker dropped", tr2.tracking.length, 0);

  // Timeout
  const tr3 = new RetestTracker(rules);
  tr3.start({ side: "long", level: 100, levelKey: "R:1:100", atrAtBreak: 1.0, breakEpoch: 0 });
  for (let i = 0; i < 7; i++) tr3.advance({ epoch: i * 900, open: 102, close: 102, high: 102.5, low: 101.5 }, 1.0);
  eq("timed-out tracker dropped", tr3.tracking.length, 0);
});

// Risk manager USD conversions
await group("risk", () => {
  const rules = {
    stake_usd: 10, stop_loss_usd: 5, atr_sl_multiplier: 1.5, min_rr: 2,
    max_trades_per_day: 3, cooldown_bars_after_loss: 0,
    max_daily_loss_usd: 10, max_consecutive_losses: 2,
  };
  const r = new RiskManager(rules);
  r.history = { trades: [] };

  // SL price for long: entry - 1.5*ATR
  const entry = 100, atr = 2;
  eq("computeSL long",  r.computeSL(entry, atr, "long"),  97);
  eq("computeSL short", r.computeSL(entry, atr, "short"), 103);
  eq("computeTP long",  r.computeTP(entry, atr, "long"),  106);

  // SL USD: pct = 3/100 = 0.03 ; usd = 10*10*0.03 = 3 (under cap of 5)
  eq("slUsd under cap", r.computeSlUsd(97, 100, 10, 10), 3);
  // SL USD with wide ATR: pct = 0.10; usd = 10*10*0.10 = 10, capped at 5.
  eq("slUsd capped",    r.computeSlUsd(90, 100, 10, 10), 5);

  // canTrade allowed when no history
  truthy("canTrade allowed (empty history)", r.canTrade(0).allowed);

  const today = new Date().toISOString();
  r.history = { trades: [
    { timestamp: today, orderPlaced: true, outcome: "loss", pnl_usd: -4 },
    { timestamp: today, orderPlaced: true, outcome: "loss", pnl_usd: -6 },
  ] };
  eq("daily loss cap blocks at threshold", r.canTrade(0).allowed, false);
  truthy("daily loss cap reason is clear", r.canTrade(0).reason.includes("daily loss cap reached"));

  r.rules = { ...rules, max_trades_per_day: 10, max_daily_loss_usd: 0 };
  r.history = { trades: [
    { timestamp: "2026-01-01T00:00:00.000Z", epoch: 0, orderPlaced: true, outcome: "win", pnl_usd: 3 },
    { timestamp: "2026-01-01T00:15:00.000Z", epoch: 900, orderPlaced: true, outcome: "loss", pnl_usd: -2 },
    { timestamp: "2026-01-01T00:30:00.000Z", epoch: 1800, orderPlaced: true, outcome: "loss", pnl_usd: -2 },
  ] };
  eq("consecutive loss cap blocks at threshold", r.canTrade(7200).allowed, false);
  truthy("consecutive loss cap reason is clear", r.canTrade(7200).reason.includes("consecutive loss cap reached"));
});

await group("trade identity", () => {
  const baseDecision = {
    derivSymbol: "R_75",
    epoch: 1710000000,
    side: "long",
    price: 123.45,
    stakeUsd: 10,
    multiplier: 50,
  };
  eq("createDecisionId deterministic", createDecisionId(baseDecision), createDecisionId({ ...baseDecision }));
  truthy("createDecisionId changes when core field changes", createDecisionId(baseDecision) !== createDecisionId({ ...baseDecision, price: 123.46 }));
  eq("createSettlementId uses contractId", createSettlementId({ contractId: "C123" }), "settlement:C123");
  eq("createSettlementId handles missing contractId safely", createSettlementId({}), null);
  eq("createOrderFilledEventId uses contractId", createOrderFilledEventId({ contractId: "C123" }), "order-filled:C123");
});

await group("trade journal", () => {
  const dir = "state-test-journal";
  const file = `${dir}/trade-events.jsonl`;
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const first = appendTradeEventOnce({
      eventId: "decision:test",
      eventType: "DECISION_RECORDED",
      timestamp: "2026-05-04T10:00:00.000Z",
      schemaVersion: TRADE_EVENT_SCHEMA_VERSION,
      payload: { ok: true },
    }, { filePath: file });
    const duplicate = appendTradeEventOnce({
      eventId: "decision:test",
      eventType: "DECISION_RECORDED",
      timestamp: "2026-05-04T10:00:01.000Z",
      payload: { ok: false },
    }, { filePath: file });
    eq("appendTradeEventOnce appends first event", first.appended, true);
    eq("appendTradeEventOnce skips duplicate eventId", duplicate.appended, false);
    eq("hasTradeEvent sees stored id", hasTradeEvent("decision:test", { filePath: file }), true);

    writeFileSync(file, [
      JSON.stringify({ eventId: "a", eventType: "DECISION_RECORDED", timestamp: "2026-05-04T10:00:00.000Z", schemaVersion: 1, payload: {} }),
      "{bad-json",
      JSON.stringify({ eventId: "b", eventType: "ORDER_FILLED", timestamp: "2026-05-04T10:00:01.000Z", schemaVersion: 1, payload: {} }),
      "",
    ].join("\n"));
    const loaded = loadTradeEvents({ filePath: file });
    eq("loadTradeEvents skips invalid JSONL lines without crashing", loaded.events.length, 2);
    eq("loadTradeEvents reports skipped invalid lines", loaded.skipped, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await group("runtime warnings", () => {
  eq("formatErrorMessage handles Error", formatErrorMessage(new Error("network down")), "network down");
  eq("formatErrorMessage handles string", formatErrorMessage("plain failure"), "plain failure");
  truthy("formatErrorMessage handles object", formatErrorMessage({ code: "EACCES", message: "permission denied" }).includes("permission denied"));
});

await group("runtime health", () => {
  const missingDir = "state-test-runtime-health-missing";
  const fixtureDir = "state-test-runtime-health-fixture";
  try {
    rmSync(missingDir, { recursive: true, force: true });
    const missing = buildRuntimeHealthReport({ rootDir: missingDir });
    eq("runtime health handles missing safety log", missing.safetyLog.exists, false);
    eq("runtime health handles missing trade count", missing.trades.total, 0);
    eq("runtime health handles missing journal event count", missing.tradeJournal.events, 0);

    rmSync(fixtureDir, { recursive: true, force: true });
    mkdirSync(`${fixtureDir}/state`, { recursive: true });
    writeFileSync(`${fixtureDir}/safety-check-log.json`, JSON.stringify({
      schemaVersion: SAFETY_LOG_SCHEMA_VERSION,
      trades: [
        { contractId: "COPEN", orderPlaced: true, outcome: null, pnl_usd: null },
        { contractId: "CWIN", orderPlaced: true, outcome: "win", pnl_usd: 7.5 },
        { contractId: "CLOSS", orderPlaced: true, outcome: "loss", pnl_usd: -3 },
      ],
    }, null, 2));
    writeFileSync(`${fixtureDir}/trades.csv`, [
      CSV_HEADERS,
      `2026-05-04,11:01:00,Deriv,VOLATILITY_75,long,,,,,CWIN,SETTLE,win,7.50,settled`,
      `2026-05-04,11:02:00,Deriv,VOLATILITY_50,short,,,,,CLOSS,SETTLE,loss,-3.00,settled`,
    ].join("\n"));
    writeFileSync(`${fixtureDir}/state/trade-events.jsonl`, [
      JSON.stringify({ eventId: "decision:1", eventType: "DECISION_RECORDED" }),
      "{bad-json",
      JSON.stringify({ eventId: "settlement:CWIN", eventType: "SETTLEMENT_RECORDED" }),
    ].join("\n"));
    writeFileSync(`${fixtureDir}/state/backtest-approved.json`, JSON.stringify({ demoApproved: true, realApproved: false }));

    const report = buildRuntimeHealthReport({ rootDir: fixtureDir });
    eq("runtime health counts safety log trades", report.trades.total, 3);
    eq("runtime health counts unsettled trades", report.trades.unsettled, 1);
    eq("runtime health counts settled wins", report.trades.settledWins, 1);
    eq("runtime health counts settled losses", report.trades.settledLosses, 1);
    eq("runtime health reports latest contract id", report.trades.latestContractId, "CLOSS");
    eq("runtime health counts settlement rows", report.csv.settlementRows, 2);
    eq("runtime health counts journal events", report.tradeJournal.events, 2);
    eq("runtime health reports skipped journal lines", report.tradeJournal.skippedInvalidLines, 1);
    eq("runtime health reports demo approval", report.backtestApproval.demoApproved, true);
    eq("runtime health reports real approval", report.backtestApproval.realApproved, false);
  } finally {
    rmSync(missingDir, { recursive: true, force: true });
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

await group("settlement csv idempotency", () => {
  const dir = "state-test-settlement-csv";
  const csv = `${dir}/trades.csv`;
  const decision = {
    timestamp: "2026-05-04T11:00:00.000Z",
    symbol: "VOLATILITY_75",
    side: "long",
    contractId: "CSET1",
    outcome: "win",
    pnl_usd: 7.5,
  };
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const first = appendSettlementCsvRowOnce(decision, { filePath: csv, settledAt: new Date("2026-05-04T11:01:00.000Z") });
    const duplicate = appendSettlementCsvRowOnce(decision, { filePath: csv, settledAt: new Date("2026-05-04T11:02:00.000Z") });
    eq("appendSettlementCsvRowOnce appends first settlement", first.appended, true);
    eq("appendSettlementCsvRowOnce skips duplicate for same contractId", duplicate.appended, false);
    eq("hasSettlementCsvRow matches SETTLE row and contract ID", hasSettlementCsvRow({ filePath: csv, contractId: "CSET1" }), true);
    eq("hasSettlementCsvRow ignores non-matching contract ID", hasSettlementCsvRow({ filePath: csv, contractId: "CSET2" }), false);
    writeFileSync(csv, [
      `${CSV_HEADERS}`,
      `2026-05-04,11:01:00,Deriv,VOLATILITY_75,long,,,,,CSET9,LIVE,,,\"filled\"`,
      `2026-05-04,11:02:00,Deriv,VOLATILITY_75,long,,,,,CSET9,SETTLE,loss,-5.00,\"settled\"`,
    ].join("\n"));
    eq("hasSettlementCsvRow returns true only for SETTLE row with matching contract ID", hasSettlementCsvRow({ filePath: csv, contractId: "CSET9" }), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Deriv trade constraints
await group("Deriv trade constraints", () => {
  eq("V75 minimum stake follows live Deriv multiplier floor", getDerivTradeConstraints("VOLATILITY_75").minStakeUsd, 1);
  eq("V50 minimum stake follows live Deriv multiplier floor", getDerivTradeConstraints("VOLATILITY_50").minStakeUsd, 1);

  eq("rejects stale V75 0.001 stake", validateDerivTradeSize({ symbol: "VOLATILITY_75", stakeUsd: 0.001, multiplier: 50 }).ok, false);
  eq("accepts V75 minimum stake", validateDerivTradeSize({ symbol: "VOLATILITY_75", stakeUsd: 1, multiplier: 50 }).ok, true);
  eq("rejects stale V75 multiplier 10", validateDerivTradeSize({ symbol: "VOLATILITY_75", stakeUsd: 1, multiplier: 10 }).ok, false);
  eq("rejects stale V50 multiplier 10", validateDerivTradeSize({ symbol: "VOLATILITY_50", stakeUsd: 1, multiplier: 10 }).ok, false);
  eq("uses V75 default multiplier", resolveMultiplierForSymbol("VOLATILITY_75", undefined), 50);
  eq("uses V50 default multiplier", resolveMultiplierForSymbol("VOLATILITY_50", undefined), 80);
});

await group("operator watchlist", () => {
  const rules = JSON.parse(readFileSync("rules.json", "utf8"));
  const watchlist = getOperatorWatchlist();
  eq("operator watchlist has exactly V75 and V50", watchlist.map(item => item.symbol).join(","), "VOLATILITY_75,VOLATILITY_50");
  eq("R_50 alias resolves to operator symbol", resolveOperatorSymbol("R_50").symbol, "VOLATILITY_50");

  const all = resolveActiveWatchlist({ rules, stakeUsd: 10 });
  eq("default active watchlist follows rules.symbols", all.symbols.join(","), "VOLATILITY_75,VOLATILITY_50");
  eq("V75 multiplier resolved", all.multipliersBySymbol.VOLATILITY_75, 50);
  eq("V50 multiplier resolved", all.multipliersBySymbol.VOLATILITY_50, 80);

  const single = resolveActiveWatchlist({ rules, envSymbol: "VOLATILITY_75", stakeUsd: 10 });
  eq("env symbol narrows to one operator symbol", single.symbols.join(","), "VOLATILITY_75");

  let rejectedDerivEnv = false;
  try { resolveActiveWatchlist({ rules, envSymbol: "R_75", stakeUsd: 10 }); }
  catch { rejectedDerivEnv = true; }
  truthy("rejects Deriv symbol in env watchlist", rejectedDerivEnv);

  let rejectedCrypto = false;
  try { resolveActiveWatchlist({ rules, envSymbol: "BTCUSDT", stakeUsd: 10 }); }
  catch { rejectedCrypto = true; }
  truthy("rejects crypto symbols", rejectedCrypto);

  let rejectedCrash = false;
  try { resolveOperatorSymbol("CRASH_500"); }
  catch { rejectedCrash = true; }
  truthy("rejects crash boom symbols", rejectedCrash);
});

await group("Deriv research symbol registry", () => {
  const catalog = getResearchSymbolCatalog();
  truthy("research catalog includes active Deriv synthetic symbols", catalog.length >= 40);
  truthy("research catalog includes Volatility 75", catalog.some(item => item.derivSymbol === "R_75"));
  truthy("research catalog includes Crash/Boom for research only", catalog.some(item => item.derivSymbol === "CRASH500") && catalog.some(item => item.derivSymbol === "BOOM500"));
  truthy("research catalog includes Jump and Step indices", catalog.some(item => item.derivSymbol === "JD75") && catalog.some(item => item.derivSymbol === "stpRNG"));
  eq("V75 research alias normalizes to Deriv symbol", normalizeDerivResearchSymbol("VOLATILITY_75"), "R_75");
  eq("Crash 500 research alias normalizes to Deriv symbol", normalizeDerivResearchSymbol("CRASH_500"), "CRASH500");
  eq("Boom 500 display-derived TradingView symbol", toTradingViewSymbol("BOOM_500"), "DERIV:BOOM_500_INDEX");
  eq("Volatility 75 existing TradingView symbol preserved", toTradingViewSymbol("R_75"), "DERIV:VOLATILITY_75_INDEX");
  eq("Volatility 75 1s TradingView symbol", toTradingViewSymbol("VOLATILITY_75_1S"), "DERIV:VOLATILITY_75_1S_INDEX");
  eq("resolve research symbol marks Crash as non-execution", resolveResearchSymbol("CRASH_500").executionSupported, false);
  eq("resolve research symbol marks V75 as execution-supported", resolveResearchSymbol("VOLATILITY_75").executionSupported, true);
});

await group("Trading Jarvis plugin", () => {
  const pluginDir = "plugins/trading-jarvis";
  const result = spawnSync(process.execPath, ["scripts/operator-check.js"], {
    cwd: pluginDir,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, SYMBOL: "", MULTIPLIER: "" },
  });
  eq("operator check exits cleanly from plugin cwd", result.status, 0);
  const output = JSON.parse(result.stdout);
  eq("operator check resolves repo package from plugin cwd", output.package?.name, "claude-tradingview-mcp-trading");
  truthy("operator check resolves Codex bridge from plugin cwd", output.codexBridge.ok);
  eq("operator check exposes Deriv-only active symbols", output.activeSymbols.join(","), "VOLATILITY_75,VOLATILITY_50");
  eq("operator check exposes two symbol switch commands", output.symbolSwitchCommands.length, 2);
});

await group("Codex Strategy Lab scripts", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  truthy("package exposes codex doctor script", Boolean(pkg.scripts["codex:doctor"]));
  truthy("package exposes research symbols script", Boolean(pkg.scripts["research:symbols"]));
  truthy("package exposes research candles script", Boolean(pkg.scripts["research:candles"]));

  const doctor = spawnSync(process.execPath, ["scripts/codex-doctor.js", "--json"], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, DERIV_API_TOKEN: "redacted-test-token" },
  });
  eq("codex doctor exits cleanly", doctor.status, 0);
  const report = JSON.parse(doctor.stdout);
  eq("codex doctor reports env presence", report.env.DERIV_API_TOKEN_set, true);
  eq("codex doctor does not print token value", doctor.stdout.includes("redacted-test-token"), false);
  eq("codex doctor keeps execution symbols narrow", report.execution.symbols.join(","), "VOLATILITY_75,VOLATILITY_50");
  truthy("codex doctor reports research catalog size", report.research.catalogCount >= 40);
});

await group("Codex Autonomy Lab", () => {
  const status = buildAutonomyStatus({
    env: { DERIV_API_TOKEN: "redacted-test-token", CODEX_ALLOW_LIVE_TRADING: "" },
    packageJson: { name: "claude-tradingview-mcp-trading", version: "2.0.0" },
    executionSymbols: ["VOLATILITY_75", "VOLATILITY_50"],
    researchCatalog: getResearchSymbolCatalog(),
    backtestApprovalExists: false,
  });
  eq("autonomy status redacts token value", JSON.stringify(status).includes("redacted-test-token"), false);
  eq("autonomy status keeps execution symbols narrow", status.execution.symbols.join(","), "VOLATILITY_75,VOLATILITY_50");
  eq("autonomy status is research-first", status.mode, "research_only");
  eq("autonomy status live execution unavailable by default", status.execution.liveToolAvailable, false);
  truthy("autonomy status reports strategy generation capability", status.capabilities.some(item => item.id === "candidate_strategy_backtest"));

  const plan = buildAutonomyPlan({
    objective: "find better V75/V50 breakout filters",
    symbols: ["VOLATILITY_75", "CRASH_500"],
    candleCount: 750,
    granularity: 900,
  });
  eq("autonomy plan preserves objective", plan.objective, "find better V75/V50 breakout filters");
  eq("autonomy plan marks Crash as research only", plan.symbols.find(item => item.symbol === "CRASH_500").executionEligible, false);
  truthy("autonomy plan includes local backtest phase", plan.phases.some(phase => phase.id === "local_candidate_backtest"));
  truthy("autonomy plan requires promotion gates before execution", plan.stopConditions.some(item => item.includes("validate-backtest")));

  const candidates = generateStrategyCandidates({ symbol: "VOLATILITY_75" });
  truthy("candidate generator returns multiple ideas", candidates.length >= 3);
  truthy("candidate generator includes no execution approval", candidates.every(candidate => candidate.executionApproved === false));

  const candles = Array.from({ length: 90 }, (_, i) => ({
    epoch: 1000 + i * 900,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
  }));
  const results = backtestCandidateSet({ candles, candidates });
  truthy("candidate backtest returns scored results", results.length === candidates.length && results.every(result => Number.isFinite(result.score)));
  truthy("candidate backtest produces trades on trending fixture", results.some(result => result.metrics.trades > 0));
  const ranked = rankBacktestResults(results);
  truthy("ranker sorts best score first", ranked[0].score >= ranked.at(-1).score);

  const autonomyDir = "state-test-autonomy";
  try {
    rmSync(autonomyDir, { recursive: true, force: true });
    mkdirSync(autonomyDir, { recursive: true });
    writeFileSync(`${autonomyDir}/candles.json`, `\uFEFF${JSON.stringify({ candles })}`);
    eq("candle payload loader handles UTF-8 BOM", loadCandlePayload(`${autonomyDir}/candles.json`).candles.length, candles.length);
    const backtestCli = spawnSync(process.execPath, ["scripts/codex-autonomy.js", "backtest", "--file", `${autonomyDir}/candles.json`, "--json"], {
      encoding: "utf8",
      shell: false,
    });
    eq("codex autonomy backtest CLI accepts spaced --file", backtestCli.status, 0);
    const backtestOutput = JSON.parse(backtestCli.stdout);
    truthy("codex autonomy backtest CLI ranks candidates", backtestOutput.results.length >= 3);
    eq("codex autonomy backtest CLI stays research-only", backtestOutput.executionApproved, false);
  } finally {
    rmSync(autonomyDir, { recursive: true, force: true });
  }

  const cli = spawnSync(process.execPath, ["scripts/codex-autonomy.js", "status", "--json"], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, DERIV_API_TOKEN: "redacted-test-token", CODEX_ALLOW_LIVE_TRADING: "" },
  });
  eq("codex autonomy status CLI exits cleanly", cli.status, 0);
  eq("codex autonomy status CLI does not print token", cli.stdout.includes("redacted-test-token"), false);
  const cliStatus = JSON.parse(cli.stdout);
  eq("codex autonomy status CLI reports research mode", cliStatus.mode, "research_only");
});

await group("Trading Jarvis command center", () => {
  const roadmap = buildJarvisRoadmap();
  eq("Jarvis roadmap covers seven layers", roadmap.layers.length, 7);
  truthy("Jarvis roadmap includes command center", roadmap.layers.some(layer => layer.id === "tradingview_command_center"));
  truthy("Jarvis roadmap includes trade desk", roadmap.layers.some(layer => layer.id === "trade_desk_mode"));
  truthy("Jarvis roadmap keeps execution gated", roadmap.guardrails.some(item => item.includes("validate-backtest")));

  const commandCenter = buildCommandCenter({
    chartState: { targetCount: 1, targets: [{ title: "TradingView", url: "https://www.tradingview.com/chart/?symbol=DERIV:VOLATILITY_75_INDEX" }] },
    indicators: [{ name: "EMA", title: "Moving Average Exponential" }],
    accountSummary: { loginid: "VR000", balance: 1000, apiToken: "must-not-leak" },
    screenshot: { path: "state/chart.png", bytes: 1234 },
    symbol: "VOLATILITY_75",
    timeframe: "15",
  });
  eq("command center reports requested symbol", commandCenter.chart.symbol, "VOLATILITY_75");
  eq("command center redacts account token", JSON.stringify(commandCenter).includes("must-not-leak"), false);
  eq("command center reports visible indicator count", commandCenter.chart.indicatorCount, 1);
  eq("command center action is ready when chart target exists", commandCenter.status, "ready");

  const candles = Array.from({ length: 80 }, (_, i) => ({
    epoch: 1000 + i * 900,
    open: 100 + i * 0.5,
    high: 101 + i * 0.5,
    low: 99 + i * 0.5,
    close: 100.6 + i * 0.5,
  }));
  const rules = JSON.parse(readFileSync("rules.json", "utf8"));
  const analysis = analyzeChartCandles({ symbol: "VOLATILITY_75", timeframe: "15", candles, rules });
  eq("chart analyst keeps execution approval false", analysis.executionApproved, false);
  eq("chart analyst detects bullish bias on rising fixture", analysis.bias, "bullish");
  truthy("chart analyst returns EMA RSI ATR snapshot", analysis.indicators.ema > 0 && analysis.indicators.rsi > 0 && analysis.indicators.atr > 0);
  truthy("chart analyst returns a next action", ["watch", "wait", "skip"].includes(analysis.nextAction));

  const scanned = scanWatchlist({
    rules,
    symbolCandles: {
      VOLATILITY_75: candles,
      CRASH_500: candles.map(candle => ({ ...candle, close: candle.close + 10 })),
    },
  });
  eq("watchlist scanner returns two symbols", scanned.results.length, 2);
  eq("watchlist scanner marks Crash research-only", scanned.results.find(item => item.symbol === "CRASH_500").executionEligible, false);
  truthy("watchlist scanner ranks results", scanned.results[0].rank === 1 && scanned.results[1].rank === 2);

  const strategyBrief = buildStrategyBuilderBrief({ objective: "improve breakout filters", symbols: ["VOLATILITY_75", "CRASH_500"] });
  eq("strategy builder brief stays research-only", strategyBrief.mode, "research_only");
  truthy("strategy builder includes candidate generation", strategyBrief.steps.some(step => step.id === "generate_candidates"));
  truthy("strategy builder marks Crash research-only", strategyBrief.symbols.find(item => item.symbol === "CRASH_500").executionEligible === false);

  const backtestChecklist = buildBacktestOperatorChecklist({ symbols: ["VOLATILITY_75", "VOLATILITY_50"], pineFile: "pine/breakout_retest_v1.pine" });
  truthy("backtest checklist includes Pine compile", backtestChecklist.steps.some(step => step.id === "pine_compile_check"));
  truthy("backtest checklist includes Strategy Tester export", backtestChecklist.steps.some(step => step.id === "export_strategy_tester_trades"));
  truthy("backtest checklist includes validate-backtest", backtestChecklist.steps.some(step => step.command.includes("validate-backtest")));

  const tradeBlocked = buildTradeDeskChecklist({
    explicitExecutionRequest: false,
    account: { loginid: "VR000", is_virtual: true },
    approval: { demoApproved: true },
    openPositions: [],
    env: { SYMBOL: "VOLATILITY_75", STAKE_USD: "10", STOP_LOSS_USD: "5" },
  });
  eq("trade desk blocks without explicit execution request", tradeBlocked.allowed, false);
  truthy("trade desk names missing explicit request", tradeBlocked.gates.some(gate => gate.id === "explicit_current_request" && gate.pass === false));

  const tradeAllowed = buildTradeDeskChecklist({
    explicitExecutionRequest: true,
    account: { loginid: "VR000", is_virtual: true },
    approval: { demoApproved: true },
    openPositions: [],
    env: { SYMBOL: "VOLATILITY_75", STAKE_USD: "10", STOP_LOSS_USD: "5" },
  });
  eq("trade desk allows demo when all gates pass", tradeAllowed.allowed, true);

  const morningBrief = buildMorningBriefPlan({
    includeResearch: ["CRASH_500", "BOOM_1000"],
    runtimeHealth: { trades: { unsettled: 1 }, csv: { settlementRows: 2 } },
    toolAvailability: { tv_set_chart: true, tv_capture_screenshot: true, tv_get_pine_errors: true },
  });
  eq("morning brief is read-only", morningBrief.readOnly, true);
  eq("morning brief disables trade execution", morningBrief.tradeExecutionAllowed, false);
  eq("morning brief disables scheduling", morningBrief.schedulingEnabled, false);
  truthy("morning brief includes V75 by default", morningBrief.symbols.some(item => item.symbol === "VOLATILITY_75"));
  truthy("morning brief includes V50 by default", morningBrief.symbols.some(item => item.symbol === "VOLATILITY_50"));
  eq("morning brief marks Crash research-only", morningBrief.symbols.find(item => item.symbol === "CRASH_500").executionEligible, false);
  eq("morning brief marks Boom research-only", morningBrief.symbols.find(item => item.symbol === "BOOM_1000").researchOnly, true);
  truthy("morning brief includes TradingView screenshot task", morningBrief.recommendedTradingViewTasks.some(task => task.id === "capture_screenshot"));
  truthy("morning brief analysis prompt forbids execution", morningBrief.analysisPrompt.includes("no trade execution"));

  const reportDir = "state-test-jarvis-reports";
  try {
    rmSync(reportDir, { recursive: true, force: true });
    const report = writeJarvisReport({ report: { kind: "chart-analysis", analysis }, outputDir: reportDir, now: new Date("2026-05-05T17:40:00Z") });
    eq("Jarvis report writes JSON file", existsSync(report.path), true);
    const saved = JSON.parse(readFileSync(report.path, "utf8"));
    eq("Jarvis report preserves report kind", saved.kind, "chart-analysis");
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }

  const cli = spawnSync(process.execPath, ["scripts/jarvis.js", "plan", "--json"], {
    encoding: "utf8",
    shell: false,
  });
  eq("jarvis plan CLI exits cleanly", cli.status, 0);
  const cliPlan = JSON.parse(cli.stdout);
  truthy("jarvis plan CLI returns roadmap layers", cliPlan.layers.length === 7);

  const morningCli = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", "run", "jarvis", "--", "morning-brief", "--json"], {
      encoding: "utf8",
      shell: false,
    })
    : spawnSync("npm", ["run", "jarvis", "--", "morning-brief", "--json"], {
    encoding: "utf8",
      shell: false,
    });
  eq("npm run jarvis -- morning-brief --json exits cleanly", morningCli.status, 0);
  const morningCliStdout = morningCli.stdout || morningCli.output?.filter(Boolean).join("");
  const morningCliPlan = JSON.parse(morningCliStdout.slice(morningCliStdout.indexOf("{")));
  eq("morning brief CLI reports readOnly true", morningCliPlan.readOnly, true);
  eq("morning brief CLI reports trade execution disabled", morningCliPlan.tradeExecutionAllowed, false);

  const cliDir = "state-test-jarvis-cli";
  try {
    rmSync(cliDir, { recursive: true, force: true });
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(`${cliDir}/watchlist.json`, JSON.stringify({ symbolCandles: { VOLATILITY_75: candles, CRASH_500: candles } }));
    const scanCli = spawnSync(process.execPath, ["scripts/jarvis.js", "scan", "--file", `${cliDir}/watchlist.json`, "--json"], {
      encoding: "utf8",
      shell: false,
    });
    eq("jarvis scan CLI accepts documented --file", scanCli.status, 0);
    const cliScan = JSON.parse(scanCli.stdout);
    eq("jarvis scan CLI returns watchlist results", cliScan.results.length, 2);
    eq("jarvis scan CLI keeps Crash research-only", cliScan.results.find(item => item.symbol === "CRASH_500").executionEligible, false);
  } finally {
    rmSync(cliDir, { recursive: true, force: true });
  }
});

await group("Windows TradingView launcher", () => {
  const launcher = readFileSync("launch.ps1", "utf8");
  eq("launcher is not tied to TradingView 3.1.0.7818", launcher.includes("TradingView.Desktop_3.1.0.7818"), false);
  truthy("launcher discovers AppX install locations", launcher.includes("Get-AppxPackage"));
  truthy("launcher can resolve without starting TradingView", launcher.includes("ResolveOnly"));
  truthy("launcher keeps CDP verification on 9222", launcher.includes("$CDP_PORT = 9222") && launcher.includes("/json/version"));

  const dir = "state-test-launcher";
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const fakeExe = `${process.cwd()}\\${dir}\\TradingView.exe`;
    writeFileSync(fakeExe, "");
    const result = spawnSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", "launch.ps1", "-ResolveOnly"], {
      encoding: "utf8",
      shell: false,
      env: { ...process.env, TRADINGVIEW_EXE: fakeExe, TV_EXE: "" },
    });
    eq("ResolveOnly exits cleanly with explicit executable", result.status, 0);
    eq("ResolveOnly prints resolved executable", result.stdout.trim().toLowerCase(), fakeExe.toLowerCase());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await group("secret scanner", () => {
  const dir = "tmp-secret-scan";
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/env.example`, "DERIV_API_TOKEN=your_deriv_api_token_here\n");
    writeFileSync(`${dir}/bad-token.txt`, "DERIV_API_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
    writeFileSync(`${dir}/runtime.csv`, "Date,Symbol\n");

    const clean = scanRepo({
      rootDir: process.cwd(),
      trackedFiles: [`${dir}/env.example`],
    });
    eq("allows Deriv token placeholder", clean.ok, true);

    const leaked = scanRepo({
      rootDir: process.cwd(),
      trackedFiles: [`${dir}/bad-token.txt`],
    });
    eq("rejects non-placeholder Deriv token", leaked.ok, false);
    truthy("reports Deriv token finding", leaked.findings.some(f => f.reason.includes("DERIV_API_TOKEN")));

    const runtime = scanRepo({
      rootDir: process.cwd(),
      trackedFiles: ["trades.csv", "state/backtest-approved.json", "safety-check-log.json"],
    });
    eq("rejects tracked runtime artifacts", runtime.findings.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Local artifact migration/reset
await group("runtime artifacts", () => {
  const dir = "state-test-artifacts";
  const csv = `${dir}/trades.csv`;
  const safety = `${dir}/safety-check-log.json`;
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(csv, "Date,Time (UTC),Exchange,Symbol,Side,Quantity,Price,Total USD,Fee (est.),Net Amount,Order ID,Mode,Notes\nold\n");
    writeFileSync(safety, JSON.stringify({ trades: [{ symbol: "CRASH_500", orderPlaced: true }] }, null, 2));

    const result = prepareRuntimeArtifacts({ stateDir: dir, csvFile: csv, safetyLogFile: safety });
    eq("legacy trades.csv archived", result.csv.action, "archived");
    eq("legacy safety log archived", result.safetyLog.action, "archived");
    eq("new trades.csv header", readFileSync(csv, "utf8").trim(), CSV_HEADERS);

    const safetyLog = JSON.parse(readFileSync(safety, "utf8"));
    eq("new safety log schema version", safetyLog.schemaVersion, SAFETY_LOG_SCHEMA_VERSION);
    eq("new safety log starts empty", safetyLog.trades.length, 0);

    const archived = readdirSync(dir);
    truthy("legacy csv archive exists", archived.some(f => /^trades\.legacy-\d{8}-\d{6}\.csv$/.test(f)));
    truthy("legacy safety archive exists", archived.some(f => /^safety-check-log\.legacy-\d{8}-\d{6}\.json$/.test(f)));
    eq("shared traded-levels file not created", existsSync(`${dir}/traded-levels.json`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Codex MCP bridge
await group("codex mcp bridge", async () => {
  eq("normalizes V75 to Deriv symbol", normalizeSyntheticSymbol("VOLATILITY_75"), "R_75");
  eq("normalizes V50 to Deriv symbol", normalizeSyntheticSymbol("VOLATILITY_50"), "R_50");
  eq("normalizes V75 to TradingView chart symbol", normalizeTradingViewSyntheticSymbol("VOLATILITY_75"), "DERIV:VOLATILITY_75_INDEX");
  eq("normalizes V50 to TradingView chart symbol", normalizeTradingViewSyntheticSymbol("VOLATILITY_50"), "DERIV:VOLATILITY_50_INDEX");

  let rejected = false;
  try { normalizeSyntheticSymbol("CRASH_500"); }
  catch { rejected = true; }
  truthy("execution normalizer still rejects crash boom symbols", rejected);

  const tvCalls = [];
  const externalCalls = [];
  const derivFactoryCalls = [];
  const tools = createCodexTools({
    allowLiveTrading: false,
    externalTradingViewTools: [
      { name: "chart_get_state", description: "external chart state", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
      { name: "pine_get_source", description: "external pine source", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
      { name: "capture_screenshot", description: "external screenshot", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
      { name: "tv_health_check", description: "duplicate should not replace local", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    ],
    externalTradingViewCaller: async (name, args) => { externalCalls.push([name, args]); return { proxied: true, name, args }; },
    tvClient: {
      health: async () => ({ connected: true, browser: "TradingView" }),
      listIndicators: async () => ([{ name: "EMA", title: "Moving Average Exponential", rowText: "EMA 9 close" }]),
      addIndicator: async (args) => { tvCalls.push(["add", args]); return { added: true, name: args.name }; },
      removeIndicator: async (args) => { tvCalls.push(["remove", args]); return { removed: 1, name: args.name }; },
      setChart: async (args) => { tvCalls.push(["setChart", args]); return { symbol: args.symbol, timeframe: args.timeframe }; },
      injectPineSource: async (args) => { tvCalls.push(["injectPineSource", args]); return { injected: true, sourceLength: args.source.length }; },
      getPineErrors: async () => ({ hasErrors: true, errors: ["line 10: Syntax error"] }),
      captureScreenshot: async (args) => { tvCalls.push(["captureScreenshot", args]); return { path: "state/chart.png", bytes: 12 }; },
    },
    derivClientFactory: (factoryArgs = {}) => {
      derivFactoryCalls.push(factoryArgs);
      return ({
      authorize: async () => ({ loginid: "VR000", is_virtual: true, currency: "USD", balance: 1000 }),
      activeSymbols: async () => ([
        { symbol: "R_75", display_name: "Volatility 75 Index", market: "synthetic_index", submarket: "random_index" },
        { symbol: "BOOM500", display_name: "Boom 500 Index", market: "synthetic_index", submarket: "crash_index" },
      ]),
      candles: async () => ([{ epoch: 1, open: 1, high: 2, low: 0.5, close: 1.5 }]),
      close: () => {},
    });
    },
    strategyEvaluator: async () => ({ symbol: "VOLATILITY_75", signal: null, mode: "DRY_RUN" }),
  });

  const names = tools.list().map(t => t.name);
  truthy("lists tv health tool", names.includes("tv_health_check"));
  truthy("lists tv list indicators tool", names.includes("tv_list_indicators"));
  truthy("lists tv add indicator tool", names.includes("tv_add_indicator"));
  truthy("lists tv remove indicator tool", names.includes("tv_remove_indicator"));
  truthy("lists tv set chart tool", names.includes("tv_set_chart"));
  truthy("lists tv research set chart tool", names.includes("tv_research_set_chart"));
  truthy("lists pine source injection tool", names.includes("tv_inject_pine_source"));
  truthy("lists pine errors tool", names.includes("tv_get_pine_errors"));
  truthy("lists screenshot tool", names.includes("tv_capture_screenshot"));
  truthy("lists external chart state proxy", names.includes("chart_get_state"));
  truthy("lists external pine source proxy", names.includes("pine_get_source"));
  truthy("lists external capture proxy", names.includes("capture_screenshot"));
  truthy("lists deriv account summary tool", names.includes("deriv_account_summary"));
  truthy("lists deriv active symbols tool", names.includes("deriv_active_symbols"));
  truthy("lists deriv candles tool", names.includes("deriv_candles"));
  truthy("lists deriv research candles tool", names.includes("deriv_research_candles"));
  truthy("lists strategy dry run tool", names.includes("strategy_evaluate_dry_run"));
  truthy("lists strategy autonomy status tool", names.includes("strategy_autonomy_status"));
  truthy("lists strategy autonomy plan tool", names.includes("strategy_autonomy_plan"));
  truthy("lists strategy candidate backtest tool", names.includes("strategy_candidate_backtest"));
  truthy("lists Jarvis command center tool", names.includes("jarvis_command_center"));
  truthy("lists Jarvis analyze chart tool", names.includes("jarvis_analyze_chart"));
  truthy("lists Jarvis scan watchlist tool", names.includes("jarvis_scan_watchlist"));
  truthy("lists Jarvis trade desk tool", names.includes("jarvis_trade_desk_check"));
  truthy("lists Jarvis morning brief tool", names.includes("jarvis_morning_brief"));
  eq("live trade tool hidden by default", names.includes("deriv_place_multiplier_trade"), false);

  const health = await tools.call("tv_health_check", {});
  eq("tv health handler returns connected", health.connected, true);

  const indicators = await tools.call("tv_list_indicators", {});
  eq("list indicators returns EMA", indicators.indicators[0].name, "EMA");

  const added = await tools.call("tv_add_indicator", { name: "Moving Average Exponential" });
  eq("add indicator delegates to tv client", added.added, true);
  eq("add indicator passes name", tvCalls[0][1].name, "Moving Average Exponential");

  const removed = await tools.call("tv_remove_indicator", { name: "EMA" });
  eq("remove indicator delegates to tv client", removed.removed, 1);
  eq("remove indicator passes name", tvCalls[1][1].name, "EMA");

  const chart = await tools.call("tv_set_chart", { symbol: "VOLATILITY_75", timeframe: "15" });
  eq("set chart delegates normalized symbol", chart.symbol, "R_75");
  eq("set chart passes timeframe", tvCalls[2][1].timeframe, "15");

  let rejectedExecutionChart = false;
  try { await tools.call("tv_set_chart", { symbol: "CRASH_500", timeframe: "15" }); }
  catch { rejectedExecutionChart = true; }
  truthy("execution chart tool still rejects research-only Crash symbol", rejectedExecutionChart);

  const crashChart = await tools.call("tv_research_set_chart", { symbol: "CRASH_500", timeframe: "15" });
  eq("research chart accepts Crash symbol", crashChart.symbol, "CRASH500");
  eq("set chart passes research TradingView symbol", tvCalls[3][1].tradingViewSymbol, "DERIV:CRASH_500_INDEX");

  const injected = await tools.call("tv_inject_pine_source", { source: "//@version=5\nindicator('Test')" });
  eq("pine injection delegates source", injected.injected, true);
  eq("pine injection passes source", tvCalls[4][1].source, "//@version=5\nindicator('Test')");

  const pineErrors = await tools.call("tv_get_pine_errors", {});
  eq("pine errors report hasErrors", pineErrors.hasErrors, true);
  eq("pine errors include message", pineErrors.errors[0], "line 10: Syntax error");

  const screenshot = await tools.call("tv_capture_screenshot", { path: "state/chart.png" });
  eq("screenshot delegates path", tvCalls[5][1].path, "state/chart.png");
  eq("screenshot returns bytes", screenshot.bytes, 12);

  const proxied = await tools.call("chart_get_state", { compact: true });
  eq("external proxy delegates tool name", externalCalls[0][0], "chart_get_state");
  eq("external proxy delegates args", externalCalls[0][1].compact, true);
  eq("external proxy returns payload", proxied.proxied, true);

  const account = await tools.call("deriv_account_summary", {});
  eq("account summary redacts token", "apiToken" in account, false);
  eq("account summary login id", account.loginid, "VR000");

  const activeSymbols = await tools.call("deriv_active_symbols", {});
  eq("active symbols normalizes Deriv records", activeSymbols.symbols[1].symbol, "BOOM_500");
  eq("active symbols uses no-auth client mode", derivFactoryCalls.at(-1).requireToken, false);

  const factoryCallsBeforeInvalidCandles = derivFactoryCalls.length;
  let rejectedExecutionCandles = false;
  try { await tools.call("deriv_candles", { symbol: "CRASH_500", granularity: 900, count: 1 }); }
  catch { rejectedExecutionCandles = true; }
  truthy("execution candles tool still rejects research-only Crash symbol", rejectedExecutionCandles);
  eq("execution candles rejects unsupported symbol before creating client", derivFactoryCalls.length, factoryCallsBeforeInvalidCandles);

  const researchCandles = await tools.call("deriv_research_candles", { symbol: "CRASH_500", granularity: 900, count: 1 });
  eq("research candles accepts Crash symbol", researchCandles.symbol, "CRASH500");
  eq("research candles uses no-auth client mode", derivFactoryCalls.at(-1).requireToken, false);

  let researchAuthorizeCalls = 0;
  const noAuthResearchTools = createCodexTools({
    allowLiveTrading: false,
    externalTradingViewTools: [],
    tvClient: {
      health: async () => ({}),
      state: async () => ({}),
      listIndicators: async () => ([]),
      addIndicator: async () => ({}),
      removeIndicator: async () => ({}),
      setChart: async () => ({}),
      injectPineSource: async () => ({}),
      getPineErrors: async () => ({}),
      captureScreenshot: async () => ({}),
    },
    derivClientFactory: () => ({
      connect: async () => {},
      authorize: async () => {
        researchAuthorizeCalls++;
        throw new Error("research candles should not require authorization");
      },
      candles: async () => ([{ epoch: 1, open: 1, high: 2, low: 0.5, close: 1.5 }]),
      close: () => {},
    }),
    strategyEvaluator: async () => ({}),
  });
  const noAuthResearchCandles = await noAuthResearchTools.call("deriv_research_candles", { symbol: "CRASH_500", granularity: 900, count: 1 });
  eq("research candles works without authorization", noAuthResearchCandles.symbol, "CRASH500");
  eq("research candles skips authorize", researchAuthorizeCalls, 0);

  const autonomyStatus = await tools.call("strategy_autonomy_status", {});
  eq("autonomy MCP status is research-only", autonomyStatus.mode, "research_only");
  eq("autonomy MCP status keeps execution symbols narrow", autonomyStatus.execution.symbols.join(","), "VOLATILITY_75,VOLATILITY_50");

  const autonomyPlan = await tools.call("strategy_autonomy_plan", { objective: "research candidates", symbols: ["CRASH_500"], candleCount: 250 });
  eq("autonomy MCP plan marks Crash as research-only", autonomyPlan.symbols[0].executionEligible, false);
  truthy("autonomy MCP plan includes promotion gate", autonomyPlan.phases.some(phase => phase.id === "promotion_gate"));

  const autonomyBacktestCandles = Array.from({ length: 90 }, (_, i) => ({
    epoch: 2000 + i * 900,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
  }));
  const autonomyBacktest = await tools.call("strategy_candidate_backtest", { symbol: "VOLATILITY_75", candles: autonomyBacktestCandles });
  truthy("autonomy MCP backtest returns ranked candidates", autonomyBacktest.results.length >= 3);
  truthy("autonomy MCP backtest keeps results research-only", autonomyBacktest.results.every(result => result.executionApproved === false));

  const jarvisCenter = await tools.call("jarvis_command_center", { symbol: "VOLATILITY_75", timeframe: "15" });
  eq("Jarvis MCP command center returns symbol", jarvisCenter.chart.symbol, "VOLATILITY_75");
  eq("Jarvis MCP command center includes indicator count", jarvisCenter.chart.indicatorCount, 1);

  const jarvisAnalysis = await tools.call("jarvis_analyze_chart", { symbol: "VOLATILITY_75", timeframe: "15", candles: autonomyBacktestCandles });
  eq("Jarvis MCP analysis remains unapproved for execution", jarvisAnalysis.executionApproved, false);
  truthy("Jarvis MCP analysis returns bias", ["bullish", "bearish", "neutral"].includes(jarvisAnalysis.bias));

  const jarvisScan = await tools.call("jarvis_scan_watchlist", { symbolCandles: { VOLATILITY_75: autonomyBacktestCandles, CRASH_500: autonomyBacktestCandles } });
  eq("Jarvis MCP scanner marks Crash research-only", jarvisScan.results.find(item => item.symbol === "CRASH_500").executionEligible, false);

  const jarvisTradeDesk = await tools.call("jarvis_trade_desk_check", {
    explicitExecutionRequest: false,
    account: { loginid: "VR000", is_virtual: true },
    approval: { demoApproved: true },
    openPositions: [],
    env: { SYMBOL: "VOLATILITY_75", STAKE_USD: "10", STOP_LOSS_USD: "5" },
  });
  eq("Jarvis MCP trade desk fails closed without explicit request", jarvisTradeDesk.allowed, false);

  const jarvisBrief = await tools.call("jarvis_morning_brief", { includeResearch: ["CRASH_500"], timeframes: "60,15" });
  eq("Jarvis MCP morning brief is read-only", jarvisBrief.readOnly, true);
  eq("Jarvis MCP morning brief disables execution", jarvisBrief.tradeExecutionAllowed, false);
  eq("Jarvis MCP morning brief marks Crash research-only", jarvisBrief.symbols.find(item => item.symbol === "CRASH_500").executionEligible, false);

  const liveEnabledTools = createCodexTools({
    allowLiveTrading: true,
    tvClient: {
      health: async () => ({}),
      state: async () => ({}),
      listIndicators: async () => ([]),
      addIndicator: async () => ({}),
      removeIndicator: async () => ({}),
      setChart: async () => ({}),
      injectPineSource: async () => ({}),
      getPineErrors: async () => ({}),
      captureScreenshot: async () => ({}),
    },
    derivClientFactory: () => ({}),
    strategyEvaluator: async () => ({}),
  });
  truthy("live trade tool appears only when explicitly enabled", liveEnabledTools.list().some(t => t.name === "deriv_place_multiplier_trade"));
  let liveBlocked = false;
  try { await liveEnabledTools.call("deriv_place_multiplier_trade", { symbol: "VOLATILITY_75", side: "long", stakeUsd: 1, multiplier: 10, stopLossUsd: 1 }); }
  catch { liveBlocked = true; }
  truthy("live trade tool remains blocked even when listed", liveBlocked);
});

// Log rotation
await group("log rotation", () => {
  const dir = "state-test-log-rotation";
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const r = new RiskManager({
      stake_usd: 10, stop_loss_usd: 5, atr_sl_multiplier: 1.5, min_rr: 2,
      max_trades_per_day: 3, cooldown_bars_after_loss: 0,
      max_daily_loss_usd: 0, max_consecutive_losses: 0,
    }, { logFile: `${dir}/safety-check-log.json` });
    r.history = { trades: Array.from({ length: 1001 }, (_, i) => ({ idx: i, orderPlaced: false })) };
    // recordDecision triggers rotation
    r.recordDecision({ idx: 1001, orderPlaced: false, timestamp: new Date().toISOString() });
    eq("trades trimmed to 502 after rotation (501 kept + 1 new)", r.history.trades.length, 502);
    const saved = JSON.parse(readFileSync(`${dir}/safety-check-log.json`, "utf8"));
    eq("rotated safety log keeps schema version", saved.schemaVersion, SAFETY_LOG_SCHEMA_VERSION);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Integration tests
await group("integration — cycle guards", async () => {
  for (const t of integrationTests) {
    try {
      await t.run(
        (label, actual, expected) => eq(`${t.name} | ${label}`, actual, expected),
        (label, actual)           => truthy(`${t.name} | ${label}`, actual)
      );
    } catch (err) {
      fail++;
      failures.push({ label: t.name, actual: err.message, expected: "no error" });
      console.log(`  FAIL ${t.name} — threw: ${err.message}`);
    }
  }
});

await group("backtest validator", async () => {
  for (const t of backtestValidatorTests) {
    try {
      await t.run(
        (label, actual, expected) => eq(`${t.name} | ${label}`, actual, expected),
        (label, actual)           => truthy(`${t.name} | ${label}`, actual)
      );
    } catch (err) {
      fail++;
      failures.push({ label: t.name, actual: err.message, expected: "no error" });
      console.log(`  FAIL ${t.name} - threw: ${err.message}`);
    }
  }
});

await group("git remote preflight", async () => {
  for (const t of gitRemotePreflightTests) {
    try {
      await t.run(
        (label, actual, expected) => eq(`${t.name} | ${label}`, actual, expected),
        (label, actual)           => truthy(`${t.name} | ${label}`, actual)
      );
    } catch (err) {
      fail++;
      failures.push({ label: t.name, actual: err.message, expected: "no error" });
      console.log(`  FAIL ${t.name} - threw: ${err.message}`);
    }
  }
});

try { unlinkSync("state-test-risk-log.json"); } catch {}

// Summary
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  ${f.label}: got ${JSON.stringify(f.actual)}, expected ${JSON.stringify(f.expected)}`));
  process.exit(1);
}
