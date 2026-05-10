import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { parameterHash } from "./strategyApproval.js";

export const EXPERIMENT_LEDGER_SCHEMA_VERSION = 1;
export const DEFAULT_EXPERIMENT_LEDGER = path.join("state", "research", "experiment-ledger.jsonl");

const REQUIRED = ["strategyId", "strategyVersion", "symbol", "timeframe", "datasetSource", "parameters", "promotionDecision", "operatorAgentSource"];

function normalizeExperiment(experiment = {}) {
  for (const key of REQUIRED) {
    if (experiment[key] == null) throw new Error(`experiment missing required field: ${key}`);
  }
  if (!["promoted", "rejected", "pending", "candidate"].includes(experiment.promotionDecision)) {
    throw new Error("promotionDecision must be promoted, rejected, pending, or candidate");
  }
  if (experiment.promotionDecision === "rejected" && !experiment.rejectionReason) {
    throw new Error("rejected experiments require rejectionReason");
  }
  return {
    schemaVersion: EXPERIMENT_LEDGER_SCHEMA_VERSION,
    timestamp: experiment.timestamp || new Date().toISOString(),
    strategyId: experiment.strategyId,
    strategyVersion: experiment.strategyVersion,
    symbol: experiment.symbol,
    timeframe: experiment.timeframe,
    datasetSource: experiment.datasetSource,
    parameters: experiment.parameters,
    parameterHash: experiment.parameterHash || parameterHash(experiment.parameters),
    trainMetrics: experiment.trainMetrics || null,
    testMetrics: experiment.testMetrics || null,
    walkForwardMetrics: experiment.walkForwardMetrics || null,
    rejectionReason: experiment.rejectionReason || null,
    promotionDecision: experiment.promotionDecision,
    artifactPaths: Array.isArray(experiment.artifactPaths) ? experiment.artifactPaths : [],
    operatorAgentSource: experiment.operatorAgentSource,
  };
}

export function appendExperiment({ filePath = DEFAULT_EXPERIMENT_LEDGER, experiment } = {}) {
  const record = normalizeExperiment(experiment);
  const dir = path.dirname(filePath);
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record)}\n`, { flag: "a" });
  return record;
}

export function loadExperimentLedger({ filePath = DEFAULT_EXPERIMENT_LEDGER } = {}) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return {
          schemaVersion: EXPERIMENT_LEDGER_SCHEMA_VERSION,
          invalid: true,
          line: index + 1,
          error: err.message,
        };
      }
    });
}

export function queryExperiments(records = [], filters = {}) {
  return records.filter(record => {
    if (record.invalid) return false;
    for (const [key, value] of Object.entries(filters)) {
      if (value == null) continue;
      if (record[key] !== value) return false;
    }
    return true;
  });
}

export function hasRejectedExperiment(records = [], {
  strategyId,
  strategyVersion,
  symbol,
  timeframe,
  parameters = {},
} = {}) {
  const expectedHash = parameterHash(parameters);
  return records.some(record => !record.invalid
    && record.promotionDecision === "rejected"
    && record.strategyId === strategyId
    && String(record.strategyVersion) === String(strategyVersion)
    && record.symbol === symbol
    && record.timeframe === timeframe
    && (record.parameterHash === expectedHash || JSON.stringify(record.parameters) === JSON.stringify(parameters)));
}
