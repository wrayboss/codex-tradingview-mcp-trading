#!/usr/bin/env node
/**
 * Validate TradingView strategy-tester CSV export against the 7 go-live gates.
 *
 * Usage:
 *   node scripts/validate-backtest.js <tv-export.csv> [<tv-export-2.csv> ...]
 *
 * TradingView exports one file per symbol (R_75, R_50). Pass both to validate
 * the combined trade count gate (gate 5: ≥50 trades per symbol).
 *
 * On success, writes state/backtest-approved.json.
 *
 * Gate definitions (README §Go-Live Gates):
 *   1. Net profit > 0 after commission
 *   2. Win rate ≥ 45%
 *   3. Profit factor ≥ 1.6
 *   4. Max drawdown ≤ 15% (of initial capital)
 *   5. ≥ 50 trades per symbol
 *   6. Walk-forward degradation ≤ 20%  (70% in-sample / 30% out-of-sample PF split)
 *   7. 50 demo signals with profit factor ≥ 1.4  (checked from safety-check-log.json)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

const STATE_DIR = "state";
const APPROVED_FILE = `${STATE_DIR}/backtest-approved.json`;
const DEMO_LOG_FILE = "safety-check-log.json";

// ─── Gate thresholds ───────────────────────────────────────────────────────────
const GATES = {
  minNetProfit: 0,
  minWinRate: 0.45,
  minProfitFactor: 1.6,
  maxDrawdownPct: 0.15,
  minTradesPerSymbol: 50,
  maxWFDegradation: 0.20,
  minDemoSignals: 50,
  minDemoProfitFactor: 1.4,
};

// ─── CSV parser ────────────────────────────────────────────────────────────────
/**
 * TradingView trade-history CSV has a header row followed by data rows.
 * Each CLOSED trade appears as a single row with Profit populated.
 * Rows where Profit is empty are entry-only rows (some TV versions pair them).
 *
 * Columns we rely on (TV 2024 format):
 *   Trade #, Type, Signal, Date/Time, Price, Contracts, Profit, Cumulative Profit, Run-up, Drawdown
 *
 * We handle both comma and tab delimiters, and quoted fields.
 */
async function parseTvCsv(filePath) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  if (lines.length < 2) throw new Error(`${filePath}: too few lines`);

  // Detect delimiter
  const delim = lines[0].includes("\t") ? "\t" : ",";

  const header = splitCsvRow(lines[0], delim).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"));

  const col = name => {
    const idx = header.findIndex(h => h.includes(name));
    if (idx === -1) throw new Error(`Column "${name}" not found in ${filePath}. Headers: ${header.join(" | ")}`);
    return idx;
  };

  const iProfit = col("profit");
  const iCumProfit = col("cumulative");
  const iType = col("type");

  const trades = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = splitCsvRow(line, delim);
    const rawProfit = fields[iProfit]?.trim().replace(/[^0-9.\-]/g, "");
    if (!rawProfit) continue; // skip entry-only rows

    const profit = parseFloat(rawProfit);
    if (isNaN(profit)) continue;

    const rawCum = fields[iCumProfit]?.trim().replace(/[^0-9.\-]/g, "");
    const cumProfit = rawCum ? parseFloat(rawCum) : null;

    trades.push({ profit, cumProfit });
  }

  return trades;
}

function splitCsvRow(line, delim) {
  const fields = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === delim && !inQuote) { fields.push(cur); cur = ""; continue; }
    cur += ch;
  }
  fields.push(cur);
  return fields;
}

// ─── Metrics ───────────────────────────────────────────────────────────────────
function computeMetrics(trades) {
  if (!trades.length) return null;

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit < 0);

  const netProfit = trades.reduce((s, t) => s + t.profit, 0);
  const winRate = wins.length / trades.length;
  const grossWin = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
  const profitFactor = grossLoss === 0 ? Infinity : grossWin / grossLoss;

  // Max drawdown from cumulative profit curve
  let peak = 0, maxDrawdown = 0;
  for (const t of trades) {
    const cum = t.cumProfit ?? 0;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? (peak - cum) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return { netProfit, winRate, profitFactor, maxDrawdown, tradeCount: trades.length, grossWin, grossLoss };
}

function walkForwardPF(trades) {
  const cutoff = Math.floor(trades.length * 0.7);
  const inSample = trades.slice(0, cutoff);
  const outSample = trades.slice(cutoff);

  const pfOf = arr => {
    const wins = arr.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0);
    const losses = Math.abs(arr.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0));
    return losses === 0 ? Infinity : wins / losses;
  };

  const pfIn = pfOf(inSample);
  const pfOut = pfOf(outSample);
  const degradation = pfIn === 0 ? 1 : (pfIn - pfOut) / pfIn;
  return { pfIn, pfOut, degradation, inCount: inSample.length, outCount: outSample.length };
}

// ─── Demo log check (gate 7) ───────────────────────────────────────────────────
function checkDemoLog() {
  if (!existsSync(DEMO_LOG_FILE)) return { count: 0, pf: 0 };
  let history;
  try { history = JSON.parse(readFileSync(DEMO_LOG_FILE, "utf8")); }
  catch { return { count: 0, pf: 0 }; }

  const demoTrades = (history.trades || []).filter(t => t.orderPlaced && t.outcome);
  const wins = demoTrades.filter(t => t.outcome === "win");
  const losses = demoTrades.filter(t => t.outcome === "loss");
  const grossWin = wins.reduce((s, t) => s + Math.abs(t.pnl_usd || 0), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl_usd || 0), 0);
  const pf = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;
  return { count: demoTrades.length, pf };
}

// ─── Gate runner ───────────────────────────────────────────────────────────────
function runGates(allTrades, perSymbol, demo) {
  const m = computeMetrics(allTrades);
  if (!m) return { pass: false, results: [{ gate: "data", pass: false, detail: "No trades parsed" }] };

  const wf = walkForwardPF(allTrades);

  const results = [];

  const gate = (id, label, pass, detail) => results.push({ gate: id, label, pass, detail });

  gate(1, "Net profit > 0", m.netProfit > GATES.minNetProfit,
    `Net profit: $${m.netProfit.toFixed(2)}`);

  gate(2, "Win rate ≥ 45%", m.winRate >= GATES.minWinRate,
    `Win rate: ${(m.winRate * 100).toFixed(1)}% (${allTrades.filter(t => t.profit > 0).length}/${allTrades.length})`);

  gate(3, "Profit factor ≥ 1.6", m.profitFactor >= GATES.minProfitFactor,
    `PF: ${m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2)}`);

  gate(4, "Max drawdown ≤ 15%", m.maxDrawdown <= GATES.maxDrawdownPct,
    `Max DD: ${(m.maxDrawdown * 100).toFixed(1)}%`);

  const perSymPasses = perSymbol.every(s => s.count >= GATES.minTradesPerSymbol);
  gate(5, `≥ ${GATES.minTradesPerSymbol} trades per symbol`, perSymPasses,
    perSymbol.map(s => `${s.symbol}: ${s.count} trades`).join(" | "));

  gate(6, "Walk-forward degradation ≤ 20%", wf.degradation <= GATES.maxWFDegradation,
    `PF in-sample ${wf.pfIn === Infinity ? "∞" : wf.pfIn.toFixed(2)} (${wf.inCount} trades) → out-of-sample ${wf.pfOut === Infinity ? "∞" : wf.pfOut.toFixed(2)} (${wf.outCount} trades), degradation ${(wf.degradation * 100).toFixed(1)}%`);

  gate(7, `≥ ${GATES.minDemoSignals} demo signals with PF ≥ ${GATES.minDemoProfitFactor}`,
    demo.count >= GATES.minDemoSignals && demo.pf >= GATES.minDemoProfitFactor,
    `Demo settled: ${demo.count} trades | PF: ${demo.pf === Infinity ? "∞" : demo.pf.toFixed(2)}`);

  const allPass = results.every(r => r.pass);
  return { pass: allPass, results, metrics: m, wf };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("Usage: node scripts/validate-backtest.js <tv-export.csv> [<tv-export-2.csv> ...]");
    console.error("Export from TradingView → Strategy Tester → Export icon → List of Trades");
    process.exit(1);
  }

  const perSymbol = [];
  const allTrades = [];

  for (const file of args) {
    if (!existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
    const symbol = path.basename(file, path.extname(file));
    console.log(`\nParsing ${file}...`);
    const trades = await parseTvCsv(file);
    console.log(`  ${trades.length} closed trades found`);
    perSymbol.push({ symbol, count: trades.length });
    allTrades.push(...trades);
  }

  console.log(`\nTotal trades across all files: ${allTrades.length}`);

  const demo = checkDemoLog();
  console.log(`Demo log: ${demo.count} settled trades | PF ${demo.pf === Infinity ? "∞" : demo.pf.toFixed(2)}`);

  const { pass, results, metrics, wf } = runGates(allTrades, perSymbol, demo);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  BACKTEST GO-LIVE GATE RESULTS");
  console.log("═══════════════════════════════════════════════════════════");

  for (const r of results) {
    const icon = r.pass ? "✓" : "✗";
    console.log(`  ${icon} Gate ${r.gate}: ${r.label}`);
    console.log(`       ${r.detail}`);
  }

  console.log("───────────────────────────────────────────────────────────");
  console.log(`  Overall: ${pass ? "ALL GATES PASSED" : "FAILED — do not enable live trading"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR);

  const record = {
    approved: pass,
    validated_at: new Date().toISOString(),
    files: args,
    gates: results,
    metrics: metrics ? {
      net_profit: parseFloat(metrics.netProfit.toFixed(2)),
      win_rate: parseFloat((metrics.winRate * 100).toFixed(2)),
      profit_factor: metrics.profitFactor === Infinity ? null : parseFloat(metrics.profitFactor.toFixed(3)),
      max_drawdown_pct: parseFloat((metrics.maxDrawdown * 100).toFixed(2)),
      trade_count: metrics.tradeCount,
    } : null,
    walk_forward: wf ? {
      pf_in_sample: wf.pfIn === Infinity ? null : parseFloat(wf.pfIn.toFixed(3)),
      pf_out_sample: wf.pfOut === Infinity ? null : parseFloat(wf.pfOut.toFixed(3)),
      degradation_pct: parseFloat((wf.degradation * 100).toFixed(2)),
    } : null,
    demo: { settled_count: demo.count, profit_factor: demo.pf === Infinity ? null : parseFloat(demo.pf.toFixed(3)) },
  };

  writeFileSync(APPROVED_FILE, JSON.stringify(record, null, 2));
  console.log(`[log] ${APPROVED_FILE} written (approved: ${pass})`);

  process.exit(pass ? 0 : 1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
