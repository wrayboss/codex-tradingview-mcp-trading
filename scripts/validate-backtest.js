#!/usr/bin/env node
/**
 * Validate TradingView strategy-tester CSV exports against the go-live gates.
 *
 * Usage:
 *   node scripts/validate-backtest.js <tv-export.csv> [<tv-export-2.csv> ...]
 *
 * Runtime trusts state/backtest-approved.json by account type:
 *   demo accounts require demoApproved === true
 *   real accounts require realApproved === true plus explicit real-account env gates
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { computeApprovalFingerprint, APPROVAL_SCHEMA_VERSION } from "../src/approvalFingerprint.js";
import { STRATEGY_APPROVAL_MODEL_VERSION, buildStrategyApprovalRecords } from "../src/strategyApproval.js";

const DEFAULT_STATE_DIR = "state";
const APPROVED_FILE_NAME = "backtest-approved.json";
const DEFAULT_DEMO_LOG_FILE = "safety-check-log.json";

export const DEFAULT_GATES = {
  minNetProfit: 0,
  minWinRate: 0.45,
  minProfitFactor: 1.6,
  maxDrawdownPct: 0.15,
  minTradesPerSymbol: 50,
  maxWFDegradation: 0.20,
  minDemoSignals: 50,
  minDemoProfitFactor: 1.4,
};

export async function parseTvCsv(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rawLines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (rawLines.length < 2) {
    throw new Error(`${filePath}: too few non-empty lines for a TradingView trade export`);
  }

  const lines = rawLines[0].trim().toLowerCase().startsWith("sep=")
    ? rawLines.slice(1)
    : rawLines;
  if (lines.length < 2) {
    throw new Error(`${filePath}: missing data rows after header`);
  }

  const delimiter = detectDelimiter(lines[0]);
  const originalHeaders = splitDelimitedRow(lines[0], delimiter).map(h => h.trim());
  const normalizedHeaders = originalHeaders.map(normalizeHeader);

  const profitIndex = findColumn({
    filePath,
    originalHeaders,
    normalizedHeaders,
    label: "Profit",
    predicate: h => (h === "profit" || h === "net_profit") && !h.includes("cumulative"),
  });
  const cumulativeIndex = findColumn({
    filePath,
    originalHeaders,
    normalizedHeaders,
    label: "Cumulative Profit",
    required: false,
    predicate: h => h.includes("cumulative") && h.includes("profit"),
  });

  const trades = [];
  const invalidRows = [];

  for (let lineNo = 2; lineNo <= lines.length; lineNo++) {
    const line = lines[lineNo - 1];
    const fields = splitDelimitedRow(line, delimiter);
    const profitCell = fields[profitIndex]?.trim() ?? "";
    if (!profitCell) continue;

    const profit = parseNumber(profitCell);
    if (profit == null) {
      invalidRows.push(`line ${lineNo} Profit=${JSON.stringify(profitCell)}`);
      continue;
    }

    let cumProfit = null;
    if (cumulativeIndex !== -1) {
      const rawCum = fields[cumulativeIndex]?.trim() ?? "";
      if (rawCum) {
        cumProfit = parseNumber(rawCum);
        if (cumProfit == null) {
          invalidRows.push(`line ${lineNo} Cumulative Profit=${JSON.stringify(rawCum)}`);
          continue;
        }
      }
    }

    trades.push({ profit, cumProfit });
  }

  if (invalidRows.length) {
    throw new Error(`${filePath}: could not parse numeric values (${invalidRows.slice(0, 5).join("; ")})`);
  }
  if (!trades.length) {
    throw new Error(`${filePath}: no closed trades found; export TradingView Strategy Tester -> List of Trades`);
  }

  return trades;
}

export function splitDelimitedRow(line, delimiter) {
  const fields = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuote && next === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === delimiter && !inQuote) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

export function computeMetrics(trades) {
  if (!trades.length) return null;

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit < 0);
  const netProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const winRate = wins.length / trades.length;
  const grossWin = wins.reduce((sum, trade) => sum + trade.profit, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.profit, 0));
  const profitFactor = grossLoss === 0 ? Infinity : grossWin / grossLoss;

  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    running += trade.profit;
    const equity = trade.cumProfit ?? running;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (peak - equity) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return { netProfit, winRate, profitFactor, maxDrawdown, tradeCount: trades.length, grossWin, grossLoss };
}

export function walkForwardPF(trades) {
  const cutoff = Math.floor(trades.length * 0.7);
  const inSample = trades.slice(0, cutoff);
  const outSample = trades.slice(cutoff);

  const pfOf = arr => {
    const wins = arr.filter(t => t.profit > 0).reduce((sum, trade) => sum + trade.profit, 0);
    const losses = Math.abs(arr.filter(t => t.profit < 0).reduce((sum, trade) => sum + trade.profit, 0));
    return losses === 0 ? (wins > 0 ? Infinity : 0) : wins / losses;
  };

  const pfIn = pfOf(inSample);
  const pfOut = pfOf(outSample);
  let degradation;
  if (pfIn === Infinity) degradation = pfOut === Infinity ? 0 : 1;
  else if (pfIn <= 0) degradation = pfOut > 0 ? 0 : 1;
  else degradation = (pfIn - pfOut) / pfIn;

  return { pfIn, pfOut, degradation, inCount: inSample.length, outCount: outSample.length };
}

export function checkDemoLog(demoLogFile = DEFAULT_DEMO_LOG_FILE) {
  if (!existsSync(demoLogFile)) return { count: 0, pf: 0 };

  let history;
  try {
    history = JSON.parse(readFileSync(demoLogFile, "utf8"));
  } catch {
    return { count: 0, pf: 0 };
  }

  const demoTrades = (history.trades || [])
    .map(trade => ({
      ...trade,
      outcome: String(trade.outcome || "").toLowerCase(),
      pnl_usd: parseNumber(String(trade.pnl_usd ?? "")),
    }))
    .filter(t => t.orderPlaced && (t.outcome === "win" || t.outcome === "loss"));
  const wins = demoTrades.filter(t => t.outcome === "win");
  const losses = demoTrades.filter(t => t.outcome === "loss");
  const grossWin = wins.reduce((sum, trade) => sum + Math.abs(trade.pnl_usd || 0), 0);
  const grossLoss = losses.reduce((sum, trade) => sum + Math.abs(trade.pnl_usd || 0), 0);
  const pf = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;
  return { count: demoTrades.length, pf };
}

export function runGates(allTrades, perSymbol, demo, gates = DEFAULT_GATES) {
  const metrics = computeMetrics(allTrades);
  if (!metrics) {
    return { pass: false, results: [{ gate: "data", label: "Trade data", pass: false, detail: "No trades parsed" }], metrics: null, wf: null };
  }

  const wf = walkForwardPF(allTrades);
  const results = [];
  const addGate = (gate, label, pass, detail) => results.push({ gate, label, pass, detail });

  addGate(1, "Net profit > 0", metrics.netProfit > gates.minNetProfit, `Net profit: $${metrics.netProfit.toFixed(2)}`);
  addGate(2, "Win rate >= 45%", metrics.winRate >= gates.minWinRate, `Win rate: ${(metrics.winRate * 100).toFixed(1)}% (${allTrades.filter(t => t.profit > 0).length}/${allTrades.length})`);
  addGate(3, "Profit factor >= 1.6", metrics.profitFactor >= gates.minProfitFactor, `PF: ${formatRatio(metrics.profitFactor)}`);
  addGate(4, "Max drawdown <= 15%", metrics.maxDrawdown <= gates.maxDrawdownPct, `Max DD: ${(metrics.maxDrawdown * 100).toFixed(1)}%`);
  addGate(5, `>= ${gates.minTradesPerSymbol} trades per symbol`, perSymbol.every(s => s.count >= gates.minTradesPerSymbol), perSymbol.map(s => `${s.symbol}: ${s.count} trades`).join(" | "));
  addGate(6, "Walk-forward degradation <= 20%", wf.degradation <= gates.maxWFDegradation, `PF in-sample ${formatRatio(wf.pfIn)} (${wf.inCount} trades) -> out-of-sample ${formatRatio(wf.pfOut)} (${wf.outCount} trades), degradation ${(wf.degradation * 100).toFixed(1)}%`);
  addGate(7, `>= ${gates.minDemoSignals} demo signals with PF >= ${gates.minDemoProfitFactor}`, demo.count >= gates.minDemoSignals && demo.pf >= gates.minDemoProfitFactor, `Demo settled: ${demo.count} trades | PF: ${formatRatio(demo.pf)}`);

  const demoApproved = results.filter(result => Number(result.gate) >= 1 && Number(result.gate) <= 6).every(result => result.pass);
  const realApproved = results.every(result => result.pass);
  return { pass: realApproved, demoApproved, realApproved, results, metrics, wf };
}

export function getValidationExitCode(result) {
  return result?.demoApproved === true ? 0 : 1;
}

export function getOverallStatusText({ demoApproved, realApproved } = {}) {
  if (realApproved === true) return "REAL APPROVED - demo and real gates passed";
  if (demoApproved === true) return "DEMO APPROVED - real trading still blocked until gate 7 passes";
  return "FAILED - demo and real trading remain blocked";
}

export function buildApprovalRecord({
  approved,
  demoApproved = approved === true,
  realApproved = approved === true,
  files,
  results,
  metrics,
  wf,
  demo,
  fingerprint = computeApprovalFingerprint(),
  now = new Date(),
}) {
  const validatedAt = now.toISOString();
  const strategyApprovals = buildStrategyApprovalRecords({
    fingerprint,
    approved,
    demoApproved,
    realApproved,
    files,
    validatedAt,
  });
  return {
    approved: approved === true,
    demoApproved: demoApproved === true,
    realApproved: realApproved === true,
    approval_schema_version: APPROVAL_SCHEMA_VERSION,
    approval_model_version: STRATEGY_APPROVAL_MODEL_VERSION,
    validated_at: validatedAt,
    files,
    fingerprint,
    strategyApprovals,
    gates: results,
    metrics: metrics ? {
      net_profit: round(metrics.netProfit, 2),
      win_rate: round(metrics.winRate * 100, 2),
      profit_factor: finiteOrNull(metrics.profitFactor, 3),
      max_drawdown_pct: round(metrics.maxDrawdown * 100, 2),
      trade_count: metrics.tradeCount,
    } : null,
    walk_forward: wf ? {
      pf_in_sample: finiteOrNull(wf.pfIn, 3),
      pf_out_sample: finiteOrNull(wf.pfOut, 3),
      degradation_pct: round(wf.degradation * 100, 2),
    } : null,
    demo: {
      settled_count: demo.count,
      profit_factor: finiteOrNull(demo.pf, 3),
    },
  };
}

export async function validateBacktest({
  files,
  stateDir = DEFAULT_STATE_DIR,
  demoLogFile = DEFAULT_DEMO_LOG_FILE,
  demo = null,
  gates = DEFAULT_GATES,
  logger = console,
  now = new Date(),
} = {}) {
  if (!files?.length) throw new Error("No TradingView export files supplied");

  const perSymbol = [];
  const allTrades = [];

  for (const file of files) {
    if (!existsSync(file)) throw new Error(`File not found: ${file}`);
    const symbol = path.basename(file, path.extname(file));
    logger.log(`\nParsing ${file}...`);
    const trades = await parseTvCsv(file);
    logger.log(`  ${trades.length} closed trades found`);
    perSymbol.push({ symbol, count: trades.length });
    allTrades.push(...trades);
  }

  logger.log(`\nTotal trades across all files: ${allTrades.length}`);

  const demoResult = demo ?? checkDemoLog(demoLogFile);
  logger.log(`Demo log: ${demoResult.count} settled trades | PF ${formatRatio(demoResult.pf)}`);

  const { pass, demoApproved, realApproved, results, metrics, wf } = runGates(allTrades, perSymbol, demoResult, gates);
  printResults(results, { demoApproved, realApproved }, logger);

  const record = buildApprovalRecord({
    approved: pass,
    demoApproved,
    realApproved,
    files,
    results,
    metrics,
    wf,
    demo: demoResult,
    now,
  });

  mkdirSync(stateDir, { recursive: true });
  const approvalFile = path.join(stateDir, APPROVED_FILE_NAME);
  writeFileSync(approvalFile, `${JSON.stringify(record, null, 2)}\n`);
  logger.log(`[log] ${approvalFile} written (demoApproved: ${record.demoApproved}, realApproved: ${record.realApproved})`);

  return { pass, demoApproved, realApproved, record, results, metrics, wf, demo: demoResult, approvalFile };
}

function detectDelimiter(headerLine) {
  const candidates = [",", "\t", ";"];
  return candidates
    .map(delimiter => ({ delimiter, count: splitDelimitedRow(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function normalizeHeader(header) {
  return header
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[%$]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findColumn({ filePath, originalHeaders, normalizedHeaders, label, predicate, required = true }) {
  const index = normalizedHeaders.findIndex(predicate);
  if (index !== -1 || !required) return index;
  throw new Error(`${filePath}: Missing required column "${label}". Available headers: ${originalHeaders.join(" | ")}`);
}

function parseNumber(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negativeByParens = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/\u2212/g, "-")
    .replace(/,/g, "")
    .replace(/[^0-9.+-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "+") return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negativeByParens ? -Math.abs(parsed) : parsed;
}

function printResults(results, approval, logger) {
  logger.log("\n============================================================");
  logger.log("  BACKTEST GO-LIVE GATE RESULTS");
  logger.log("============================================================");
  for (const result of results) {
    const icon = result.pass ? "PASS" : "FAIL";
    logger.log(`  ${icon} Gate ${result.gate}: ${result.label}`);
    logger.log(`       ${result.detail}`);
  }
  const failed = results.filter(result => !result.pass);
  if (failed.length) {
    logger.error(`\nFailed gates: ${failed.map(result => result.gate).join(", ")}.`);
  }
  logger.log("------------------------------------------------------------");
  logger.log(`  Overall: ${getOverallStatusText(approval)}`);
  logger.log("============================================================\n");
}

function formatRatio(value) {
  return value === Infinity ? "Infinity" : value.toFixed(2);
}

function finiteOrNull(value, places) {
  return Number.isFinite(value) ? round(value, places) : null;
}

function round(value, places) {
  return Number.parseFloat(value.toFixed(places));
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("Usage: node scripts/validate-backtest.js <tv-export.csv> [<tv-export-2.csv> ...]");
    console.error("Export TradingView Strategy Tester -> List of Trades, then pass the CSV or TSV file path.");
    return 1;
  }

  try {
    const result = await validateBacktest({ files });
    return getValidationExitCode(result);
  } catch (err) {
    console.error("\nBacktest validation failed before gate approval.");
    console.error(err.message);
    console.error("Trading remains blocked until this command completes with demoApproved: true or realApproved: true as required by account type.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await main();
  process.exit(exitCode);
}
