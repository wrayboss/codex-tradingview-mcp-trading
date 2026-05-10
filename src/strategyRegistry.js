import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

export const STRATEGY_LIFECYCLE_STATES = Object.freeze([
  "idea",
  "research",
  "candidate",
  "validated",
  "demo",
  "live",
  "rejected",
  "retired",
]);

const REQUIRED = ["strategyId", "version", "family", "lifecycleState", "supportedResearchSymbols", "executionEligibleSymbols", "paths", "approval"];

function toRepoPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeStrategy(manifest, { rootDir }) {
  for (const key of REQUIRED) {
    if (!(key in manifest)) throw new Error(`strategy manifest ${manifest.strategyId || "<unknown>"} missing ${key}`);
  }
  if (!STRATEGY_LIFECYCLE_STATES.includes(manifest.lifecycleState)) {
    throw new Error(`strategy ${manifest.strategyId} has invalid lifecycleState ${manifest.lifecycleState}`);
  }
  const paths = manifest.paths || {};
  const rulesPath = toRepoPath(paths.rules);
  const pinePath = toRepoPath(paths.pine);
  if (!rulesPath) throw new Error(`strategy ${manifest.strategyId} missing paths.rules`);
  if (!pinePath) throw new Error(`strategy ${manifest.strategyId} missing paths.pine`);

  return Object.freeze({
    id: manifest.strategyId,
    strategyId: manifest.strategyId,
    version: manifest.version,
    family: manifest.family,
    lifecycleState: manifest.lifecycleState,
    description: manifest.description || "",
    supportedResearchSymbols: [...manifest.supportedResearchSymbols],
    executionEligibleSymbols: [...manifest.executionEligibleSymbols],
    timeframes: { ...(manifest.timeframes || {}) },
    rulesPath,
    pinePath,
    testPaths: (paths.tests || []).map(toRepoPath),
    evidencePaths: (paths.evidence || []).map(toRepoPath),
    approvalStatus: manifest.approval?.status || "unknown",
    approval: { ...manifest.approval },
    hostNotes: [...(manifest.hostNotes || [])],
    manifestPath: toRepoPath(path.relative(rootDir, manifest.__manifestPath)),
  });
}

export function discoverStrategies({ rootDir = process.cwd(), strategiesDir = "strategies" } = {}) {
  const absoluteStrategiesDir = path.resolve(rootDir, strategiesDir);
  const strategies = [];
  if (existsSync(absoluteStrategiesDir)) {
    for (const entry of readdirSync(absoluteStrategiesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(absoluteStrategiesDir, entry.name, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      strategies.push(normalizeStrategy({ ...manifest, __manifestPath: manifestPath }, { rootDir }));
    }
  }
  strategies.sort((a, b) => a.strategyId.localeCompare(b.strategyId));
  const byId = new Map(strategies.map(strategy => [strategy.strategyId, strategy]));
  return {
    strategies,
    get: id => byId.get(id) || null,
    byLifecycle: lifecycleState => strategies.filter(strategy => strategy.lifecycleState === lifecycleState),
    executionEligibleSymbols: () => [...new Set(strategies.flatMap(strategy => strategy.executionEligibleSymbols))],
    researchSymbols: () => [...new Set(strategies.flatMap(strategy => strategy.supportedResearchSymbols))],
  };
}
