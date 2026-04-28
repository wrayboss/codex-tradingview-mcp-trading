import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
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
