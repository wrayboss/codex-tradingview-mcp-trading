#!/usr/bin/env node
import "dotenv/config";
import {
  backtestCandidateSet,
  buildResearchMatrix,
  buildAutonomyPlan,
  buildAutonomyStatus,
  generateStrategyCandidates,
  loadCandlePayload,
  rankBacktestResults,
} from "../src/strategyAutonomy.js";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printStatus(status) {
  console.log(`Codex autonomy mode: ${status.mode}`);
  console.log(`research symbols: ${status.research.catalogCount}`);
  console.log(`execution symbols: ${status.execution.symbols.join(", ")}`);
  console.log(`live orders allowed by autonomy: ${status.execution.liveOrdersAllowedByAutonomy}`);
  console.log("capabilities:");
  for (const capability of status.capabilities) {
    console.log(`- ${capability.id}: ${capability.command}`);
  }
}

function printPlan(plan) {
  console.log(`Objective: ${plan.objective}`);
  console.log(`Mode: ${plan.mode}`);
  console.log("Symbols:");
  for (const symbol of plan.symbols) {
    const gate = symbol.executionEligible ? "execution-supported" : "research-only";
    console.log(`- ${symbol.symbol} (${symbol.derivSymbol}) ${gate}`);
  }
  console.log("Phases:");
  for (const phase of plan.phases) {
    console.log(`- ${phase.id}: ${phase.command}`);
  }
}

function parseFileMap(value = "") {
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const equals = item.indexOf("=");
      if (equals === -1) return { symbol: null, file: item };
      return {
        symbol: item.slice(0, equals).trim(),
        file: item.slice(equals + 1).trim(),
      };
    });
}

function loadSweepFiles(filesArg) {
  const entries = parseFileMap(filesArg);
  if (!entries.length) {
    throw new Error("sweep requires --files SYMBOL=path.json[,SYMBOL=path.json].");
  }
  const symbolCandles = {};
  for (const entry of entries) {
    const payload = loadCandlePayload(entry.file);
    const symbol = entry.symbol || payload.symbol;
    if (!symbol) throw new Error(`No symbol provided for ${entry.file}; use SYMBOL=${entry.file}.`);
    symbolCandles[symbol] = payload.candles;
  }
  return symbolCandles;
}

function printSweep(report) {
  console.log(`Research sweep: ${report.symbols.length} symbols, mode=${report.mode}`);
  console.log(`trade execution allowed: ${report.tradeExecutionAllowed}`);
  console.log("Top symbols:");
  for (const item of report.shortlist.topSymbols) {
    console.log(`- ${item.symbol}: ${item.bestFamily || "none"} status=${item.bestStatus} score=${item.score}`);
  }
}

const command = process.argv[2] || "status";
const json = hasFlag("json");

if (command === "status") {
  const status = buildAutonomyStatus();
  if (json) printJson(status);
  else printStatus(status);
} else if (command === "plan") {
  const symbols = argValue("symbols", "VOLATILITY_75,VOLATILITY_50")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const plan = buildAutonomyPlan({
    objective: argValue("objective", "research and rank new strategy candidates"),
    symbols,
    candleCount: Number.parseInt(argValue("count", "500"), 10),
    granularity: Number.parseInt(argValue("granularity", "900"), 10),
  });
  if (json) printJson(plan);
  else printPlan(plan);
} else if (command === "backtest") {
  const file = argValue("file", "");
  const payload = loadCandlePayload(file);
  const symbol = argValue("symbol", payload.symbol || "VOLATILITY_75");
  const candidates = generateStrategyCandidates({ symbol });
  const results = rankBacktestResults(backtestCandidateSet({ candles: payload.candles, candidates }));
  const output = {
    mode: "research_only",
    symbol,
    source: file,
    results,
    executionApproved: false,
    promotionRequired: true,
  };
  if (json) printJson(output);
  else {
    console.log(`Research candidate backtest: ${symbol}`);
    for (const result of results) {
      console.log(`${result.candidateId}: score=${result.score} trades=${result.metrics.trades} netPoints=${result.metrics.netPoints.toFixed(4)} pf=${result.metrics.profitFactor}`);
    }
  }
} else if (command === "sweep") {
  const symbolCandles = loadSweepFiles(argValue("files", ""));
  const report = buildResearchMatrix({ symbolCandles });
  if (json) printJson(report);
  else printSweep(report);
} else {
  throw new Error(`Unknown codex autonomy command: ${command}`);
}
