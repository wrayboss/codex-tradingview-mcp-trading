import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, extname, basename, join } from "path";

export const STATE_DIR = "state";
export const CSV_FILE = "trades.csv";
export const SAFETY_LOG_FILE = "safety-check-log.json";
export const SAFETY_LOG_SCHEMA_VERSION = 2;

export const CSV_HEADERS = "Date,Time (UTC),Exchange,Symbol,Side,Stake USD,Multiplier,Stop Loss USD,Take Profit USD,Contract ID,Mode,Outcome,PnL USD,Notes";

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function archivePath(filePath, label) {
  const dir = dirname(filePath);
  const ext = extname(filePath);
  const name = basename(filePath, ext);
  return join(dir === "." ? "" : dir, `${name}.${label}-${timestamp()}${ext}`);
}

export function archiveFile(filePath, label = "legacy") {
  const target = archivePath(filePath, label);
  renameSync(filePath, target);
  return target;
}

export function emptySafetyLog() {
  return { schemaVersion: SAFETY_LOG_SCHEMA_VERSION, trades: [] };
}

export function isCurrentSafetyLog(value) {
  return value
    && value.schemaVersion === SAFETY_LOG_SCHEMA_VERSION
    && Array.isArray(value.trades);
}

export function loadSafetyLog(filePath = SAFETY_LOG_FILE) {
  if (!existsSync(filePath)) return emptySafetyLog();
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return isCurrentSafetyLog(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function prepareTradeCsv(filePath = CSV_FILE) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, CSV_HEADERS + "\n");
    return { action: "created" };
  }

  const firstLine = readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0];
  if (firstLine === CSV_HEADERS) return { action: "kept" };

  const archivedTo = archiveFile(filePath, "legacy");
  writeFileSync(filePath, CSV_HEADERS + "\n");
  return { action: "archived", archivedTo };
}

export function prepareSafetyLog(filePath = SAFETY_LOG_FILE) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify(emptySafetyLog(), null, 2));
    return { action: "created" };
  }

  const loaded = loadSafetyLog(filePath);
  if (loaded) return { action: "kept" };

  const archivedTo = archiveFile(filePath, "legacy");
  writeFileSync(filePath, JSON.stringify(emptySafetyLog(), null, 2));
  return { action: "archived", archivedTo };
}

export function prepareRuntimeArtifacts({
  stateDir = STATE_DIR,
  csvFile = CSV_FILE,
  safetyLogFile = SAFETY_LOG_FILE,
} = {}) {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  return {
    stateDir,
    csv: prepareTradeCsv(csvFile),
    safetyLog: prepareSafetyLog(safetyLogFile),
  };
}

export function parseSettlementProfit(value) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function applySettlement(decision, contract) {
  const pnl = parseSettlementProfit(contract?.profit);
  decision.outcome = pnl != null && pnl > 0 ? "win" : "loss";
  decision.pnl_usd = pnl;
  return { outcome: decision.outcome, pnl };
}

export function appendSettlementCsvRow(decision, { filePath = CSV_FILE, settledAt = new Date() } = {}) {
  prepareTradeCsv(filePath);
  const t = settledAt instanceof Date ? settledAt : new Date(settledAt);
  const row = [
    t.toISOString().slice(0, 10),
    t.toISOString().slice(11, 19),
    "Deriv",
    csvCell(decision.symbol),
    csvCell(decision.side || ""),
    "", "", "", "",
    csvCell(decision.contractId || ""),
    "SETTLE",
    csvCell(decision.outcome || ""),
    decision.pnl_usd != null ? Number(decision.pnl_usd).toFixed(2) : "",
    csvCell("settled"),
  ].join(",");
  appendFileSync(filePath, row + "\n");
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

export function hasSettlementCsvRow({ filePath = CSV_FILE, contractId } = {}) {
  if (!contractId || !existsSync(filePath)) return false;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;

  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    if (String(columns[9] ?? "").trim() === String(contractId).trim() && String(columns[10] ?? "").trim() === "SETTLE") {
      return true;
    }
  }

  return false;
}

export function appendSettlementCsvRowOnce(decision, { filePath = CSV_FILE, settledAt = new Date() } = {}) {
  const contractId = String(decision?.contractId ?? "").trim();
  if (!contractId) {
    return { appended: false, reason: "missing_contract_id" };
  }
  if (hasSettlementCsvRow({ filePath, contractId })) {
    return { appended: false, reason: "duplicate_contract_id" };
  }
  appendSettlementCsvRow(decision, { filePath, settledAt });
  return { appended: true };
}

export function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}
