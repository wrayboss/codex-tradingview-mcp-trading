// Lightweight test harness: no jest, no mocha. Run: npm test
import { integrationTests } from "./integration.js";
import { backtestValidatorTests } from "./backtestValidator.js";
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
import { CSV_HEADERS, SAFETY_LOG_SCHEMA_VERSION, prepareRuntimeArtifacts } from "../src/artifacts.js";
import { getDerivTradeConstraints, resolveMultiplierForSymbol, validateDerivTradeSize } from "../src/tradeConstraints.js";
import { getOperatorWatchlist, resolveActiveWatchlist, resolveOperatorSymbol } from "../src/watchlist.js";
import { createCodexTools, normalizeSyntheticSymbol, normalizeTradingViewSyntheticSymbol } from "../codex-mcp/tools.js";

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
  truthy("rejects crash boom symbols", rejected);

  const tvCalls = [];
  const externalCalls = [];
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
    derivClientFactory: () => ({
      authorize: async () => ({ loginid: "VR000", is_virtual: true, currency: "USD", balance: 1000 }),
      candles: async () => ([{ epoch: 1, open: 1, high: 2, low: 0.5, close: 1.5 }]),
      close: () => {},
    }),
    strategyEvaluator: async () => ({ symbol: "VOLATILITY_75", signal: null, mode: "DRY_RUN" }),
  });

  const names = tools.list().map(t => t.name);
  truthy("lists tv health tool", names.includes("tv_health_check"));
  truthy("lists tv list indicators tool", names.includes("tv_list_indicators"));
  truthy("lists tv add indicator tool", names.includes("tv_add_indicator"));
  truthy("lists tv remove indicator tool", names.includes("tv_remove_indicator"));
  truthy("lists tv set chart tool", names.includes("tv_set_chart"));
  truthy("lists pine source injection tool", names.includes("tv_inject_pine_source"));
  truthy("lists pine errors tool", names.includes("tv_get_pine_errors"));
  truthy("lists screenshot tool", names.includes("tv_capture_screenshot"));
  truthy("lists external chart state proxy", names.includes("chart_get_state"));
  truthy("lists external pine source proxy", names.includes("pine_get_source"));
  truthy("lists external capture proxy", names.includes("capture_screenshot"));
  truthy("lists deriv account summary tool", names.includes("deriv_account_summary"));
  truthy("lists strategy dry run tool", names.includes("strategy_evaluate_dry_run"));
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

  const injected = await tools.call("tv_inject_pine_source", { source: "//@version=5\nindicator('Test')" });
  eq("pine injection delegates source", injected.injected, true);
  eq("pine injection passes source", tvCalls[3][1].source, "//@version=5\nindicator('Test')");

  const pineErrors = await tools.call("tv_get_pine_errors", {});
  eq("pine errors report hasErrors", pineErrors.hasErrors, true);
  eq("pine errors include message", pineErrors.errors[0], "line 10: Syntax error");

  const screenshot = await tools.call("tv_capture_screenshot", { path: "state/chart.png" });
  eq("screenshot delegates path", tvCalls[4][1].path, "state/chart.png");
  eq("screenshot returns bytes", screenshot.bytes, 12);

  const proxied = await tools.call("chart_get_state", { compact: true });
  eq("external proxy delegates tool name", externalCalls[0][0], "chart_get_state");
  eq("external proxy delegates args", externalCalls[0][1].compact, true);
  eq("external proxy returns payload", proxied.proxied, true);

  const account = await tools.call("deriv_account_summary", {});
  eq("account summary redacts token", "apiToken" in account, false);
  eq("account summary login id", account.loginid, "VR000");

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

try { unlinkSync("state-test-risk-log.json"); } catch {}

// Summary
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  ${f.label}: got ${JSON.stringify(f.actual)}, expected ${JSON.stringify(f.expected)}`));
  process.exit(1);
}
