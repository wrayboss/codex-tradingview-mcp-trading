import { existsSync, readFileSync } from "fs";
import path from "path";
import { CSV_FILE, SAFETY_LOG_FILE, loadSafetyLog } from "./artifacts.js";
import { TRADE_EVENTS_FILE, loadTradeEvents } from "./tradeJournal.js";
import { formatErrorMessage } from "./runtimeWarnings.js";

function repoPath(rootDir, filePath) {
  return path.resolve(rootDir, filePath);
}

function safeJsonFile(filePath) {
  if (!existsSync(filePath)) return { exists: false, value: null, error: null };
  try {
    return { exists: true, value: JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")), error: null };
  } catch (err) {
    return { exists: true, value: null, error: formatErrorMessage(err) };
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function countSettlementRows(filePath) {
  if (!existsSync(filePath)) return { exists: false, settlementRows: 0, error: null };
  try {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    const settlementRows = lines.slice(1)
      .map(parseCsvLine)
      .filter(columns => String(columns[10] ?? "").trim() === "SETTLE")
      .length;
    return { exists: true, settlementRows, error: null };
  } catch (err) {
    return { exists: true, settlementRows: 0, error: formatErrorMessage(err) };
  }
}

function summarizeTrades(trades = []) {
  const ordered = Array.isArray(trades) ? trades : [];
  const unsettled = ordered.filter(trade => trade?.orderPlaced && trade?.contractId && (!trade.outcome || trade.pnl_usd == null));
  const settledWins = ordered.filter(trade => trade?.outcome === "win" && trade.pnl_usd != null);
  const settledLosses = ordered.filter(trade => trade?.outcome === "loss" && trade.pnl_usd != null);
  const latestWithContract = [...ordered].reverse().find(trade => trade?.contractId);
  return {
    total: ordered.length,
    unsettled: unsettled.length,
    settledWins: settledWins.length,
    settledLosses: settledLosses.length,
    latestContractId: latestWithContract?.contractId ?? null,
  };
}

export function buildRuntimeHealthReport({
  rootDir = process.cwd(),
  safetyLogFile = SAFETY_LOG_FILE,
  csvFile = CSV_FILE,
  tradeEventsFile = TRADE_EVENTS_FILE,
  backtestApprovalFile = path.join("state", "backtest-approved.json"),
  now = new Date(),
} = {}) {
  const safetyPath = repoPath(rootDir, safetyLogFile);
  const csvPath = repoPath(rootDir, csvFile);
  const journalPath = repoPath(rootDir, tradeEventsFile);
  const approvalPath = repoPath(rootDir, backtestApprovalFile);
  const safetyExists = existsSync(safetyPath);
  const safetyLog = loadSafetyLog(safetyPath);
  const trades = safetyLog?.trades || [];
  const journal = loadTradeEvents({ filePath: journalPath });
  const approval = safeJsonFile(approvalPath);
  const csv = countSettlementRows(csvPath);

  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    networkCalls: false,
    derivCalls: false,
    tradingViewCalls: false,
    safetyLog: {
      exists: safetyExists,
      valid: Boolean(safetyLog && Array.isArray(safetyLog.trades)),
      path: safetyLogFile,
    },
    trades: summarizeTrades(trades),
    tradeJournal: {
      exists: existsSync(journalPath),
      path: tradeEventsFile,
      events: journal.events.length,
      skippedInvalidLines: journal.skipped,
    },
    backtestApproval: {
      exists: approval.exists,
      path: backtestApprovalFile,
      demoApproved: approval.value?.demoApproved ?? null,
      realApproved: approval.value?.realApproved ?? null,
      error: approval.error,
    },
    csv: {
      exists: csv.exists,
      path: csvFile,
      settlementRows: csv.settlementRows,
      error: csv.error,
    },
  };
}

export function formatRuntimeHealthReport(report) {
  return [
    "Runtime health",
    `- readOnly: ${report.readOnly}`,
    `- safety log exists: ${report.safetyLog.exists}`,
    `- trade count: ${report.trades.total}`,
    `- unsettled count: ${report.trades.unsettled}`,
    `- settled wins/losses: ${report.trades.settledWins}/${report.trades.settledLosses}`,
    `- latest contractId: ${report.trades.latestContractId || "none"}`,
    `- trade journal events: ${report.tradeJournal.events}`,
    `- skipped invalid journal lines: ${report.tradeJournal.skippedInvalidLines}`,
    `- backtest approval demo/real: ${report.backtestApproval.demoApproved ?? "missing"}/${report.backtestApproval.realApproved ?? "missing"}`,
    `- CSV settlement rows: ${report.csv.settlementRows}`,
  ].join("\n");
}
