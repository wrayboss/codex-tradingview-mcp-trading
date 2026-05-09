#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "fs";
import {
  analyzeChartCandles,
  buildBacktestOperatorChecklist,
  buildCommandCenter,
  buildJarvisRoadmap,
  buildMorningBriefPlan,
  buildStrategyCompareSurface,
  buildStrategyBuilderBrief,
  buildTradeDeskChecklist,
  scanWatchlist,
  writeJarvisReport,
} from "../src/tradingJarvis.js";
import { buildRuntimeHealthReport } from "../src/runtimeHealth.js";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readJsonArg(name, fallback = null) {
  const value = argValue(name, "");
  if (!value) return fallback;
  return JSON.parse(readFileSync(value, "utf8").replace(/^\uFEFF/, ""));
}

function listArg(name, fallback = []) {
  const value = argValue(name, "");
  if (!value) return fallback;
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function print(value) {
  if (hasFlag("json")) console.log(JSON.stringify(value, null, 2));
  else if (value.layers) {
    console.log("Trading Jarvis roadmap");
    for (const layer of value.layers) console.log(`- ${layer.id}: ${layer.outcome}`);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

const command = process.argv[2] || "plan";
let result;

if (command === "plan") {
  result = buildJarvisRoadmap();
} else if (command === "command-center") {
  result = buildCommandCenter({
    chartState: readJsonArg("chart-state", { targetCount: 0, targets: [] }),
    indicators: readJsonArg("indicators", []),
    accountSummary: readJsonArg("account", null),
    screenshot: readJsonArg("screenshot", null),
    symbol: argValue("symbol", "VOLATILITY_75"),
    timeframe: argValue("timeframe", "15"),
  });
} else if (command === "analyze") {
  const payload = readJsonArg("file", null);
  if (!payload?.candles) throw new Error("--file must point to JSON with a candles array.");
  result = analyzeChartCandles({
    symbol: argValue("symbol", payload.symbol || "VOLATILITY_75"),
    timeframe: argValue("timeframe", "15"),
    candles: payload.candles,
    rules: readJsonArg("rules", JSON.parse(readFileSync("rules.json", "utf8"))),
  });
} else if (command === "scan") {
  const payload = readJsonArg("file", readJsonArg("symbol-candles", {}));
  const symbolCandles = payload?.symbolCandles || payload;
  result = scanWatchlist({ symbolCandles, rules: JSON.parse(readFileSync("rules.json", "utf8")) });
} else if (command === "strategy") {
  result = buildStrategyBuilderBrief({
    objective: argValue("objective", "improve strategy evidence"),
    symbols: argValue("symbols", "VOLATILITY_75,VOLATILITY_50").split(",").map(item => item.trim()).filter(Boolean),
  });
} else if (command === "backtest") {
  result = buildBacktestOperatorChecklist({
    symbols: argValue("symbols", "VOLATILITY_75,VOLATILITY_50").split(",").map(item => item.trim()).filter(Boolean),
    pineFile: argValue("pine-file", "pine/breakout_retest_v1.pine"),
  });
} else if (command === "compare-strategy") {
  result = buildStrategyCompareSurface({
    rules: JSON.parse(readFileSync("rules.json", "utf8")),
    currentSummary: readJsonArg("current-summary", null),
    researchSummary: readJsonArg("research-summary", null),
  });
} else if (command === "trade-desk") {
  result = buildTradeDeskChecklist({
    explicitExecutionRequest: hasFlag("explicit-execution-request"),
    account: readJsonArg("account", null),
    approval: readJsonArg("approval", null),
    openPositions: readJsonArg("open-positions", []),
    env: process.env,
  });
} else if (command === "morning-brief") {
  const [structureTimeframe, entryTimeframe] = listArg("timeframes", ["60", "15"]);
  result = buildMorningBriefPlan({
    symbols: listArg("symbols", ["VOLATILITY_75", "VOLATILITY_50"]),
    includeResearch: listArg("include-research", []),
    structureTimeframe,
    entryTimeframe,
    rules: JSON.parse(readFileSync("rules.json", "utf8")),
    runtimeHealth: buildRuntimeHealthReport(),
    toolAvailability: {
      tv_research_set_chart: true,
      tv_capture_screenshot: true,
      tv_get_pine_errors: true,
      deriv_research_candles: true,
      jarvis_scan_watchlist: true,
    },
  });
} else if (command === "write-report") {
  const report = readJsonArg("file", null);
  result = writeJarvisReport({ report });
} else {
  throw new Error(`Unknown Jarvis command: ${command}`);
}

print(result);
