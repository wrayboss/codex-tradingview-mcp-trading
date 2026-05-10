import { formatDerivActiveSymbols, getResearchSymbolCatalog, resolveResearchSymbol } from "./derivSymbolRegistry.js";
import { hasRejectedExperiment } from "./experimentLedger.js";
import { discoverStrategies } from "./strategyRegistry.js";

export const RESEARCH_CAMPAIGN_SCHEMA_VERSION = 1;

function symbolFamily(item) {
  const symbol = item.symbol || "";
  if (symbol.startsWith("CRASH_")) return "crash";
  if (symbol.startsWith("BOOM_")) return "boom";
  if (symbol.startsWith("JUMP_")) return "jump";
  if (symbol.startsWith("STEP_")) return "step";
  if (symbol.startsWith("RANGE_BREAK_")) return "range_break";
  if (symbol.endsWith("_BASKET")) return "basket";
  if (symbol === "BULL_MARKET" || symbol === "BEAR_MARKET") return "bull_bear";
  if (symbol.startsWith("VOLATILITY_")) return "volatility";
  return item.submarket || "other";
}

function normalizeActiveSymbols(activeSymbols = []) {
  if (!Array.isArray(activeSymbols) || !activeSymbols.length) return [];
  if (activeSymbols.every(item => "derivSymbol" in item && "tradingViewSymbol" in item)) {
    return activeSymbols.map(item => ({ ...item }));
  }
  return formatDerivActiveSymbols(activeSymbols);
}

export function buildSymbolUniverse({
  symbols = [],
  families = [],
  catalog = getResearchSymbolCatalog(),
  activeSymbols = [],
} = {}) {
  const live = normalizeActiveSymbols(activeSymbols);
  const source = live.length ? "deriv-active_symbols" : "repo-fallback";
  const base = live.length ? live : catalog;
  const wantedFamilies = new Set(families);
  const wantedSymbols = new Set(symbols.map(symbol => resolveResearchSymbol(symbol).symbol));
  const selected = base
    .map(item => ({ ...item, family: symbolFamily(item), researchOnly: !item.executionSupported }))
    .filter(item => {
      if (wantedSymbols.size && !wantedSymbols.has(item.symbol)) return false;
      if (wantedFamilies.size && !wantedFamilies.has(item.family)) return false;
      return true;
    });
  return {
    source,
    symbols: selected,
    families: [...new Set(selected.map(item => item.family))].sort(),
    executionEligibleSymbols: selected.filter(item => item.executionSupported).map(item => item.symbol),
    researchOnlySymbols: selected.filter(item => !item.executionSupported).map(item => item.symbol),
  };
}

function selectedStrategies(strategyIds = [], registry = discoverStrategies()) {
  const ids = strategyIds.length ? strategyIds : registry.strategies.map(strategy => strategy.strategyId);
  return ids.map(id => registry.get(id)).filter(Boolean);
}

export function buildResearchCampaign({
  id,
  objective,
  strategyIds = [],
  symbols = [],
  families = [],
  timeframes = ["15"],
  datasetSource = "deriv_research_candles",
  candleCount = 5000,
  granularity = 900,
  parameters = {},
  ledgerRecords = [],
  registry = discoverStrategies(),
  activeSymbols = [],
  now = new Date(),
} = {}) {
  if (!id) throw new Error("campaign id is required");
  if (!objective) throw new Error("campaign objective is required");
  const strategies = selectedStrategies(strategyIds, registry);
  const universe = buildSymbolUniverse({ symbols, families, activeSymbols });
  const batchPlan = [];

  for (const strategy of strategies) {
    for (const symbol of universe.symbols) {
      for (const timeframe of timeframes) {
        const rejected = hasRejectedExperiment(ledgerRecords, {
          strategyId: strategy.strategyId,
          strategyVersion: strategy.version,
          symbol: symbol.symbol,
          timeframe,
          parameters,
        });
        batchPlan.push({
          strategyId: strategy.strategyId,
          strategyVersion: strategy.version,
          lifecycleState: strategy.lifecycleState,
          symbol: symbol.symbol,
          derivSymbol: symbol.derivSymbol,
          family: symbol.family,
          timeframe,
          datasetSource,
          candleCount,
          granularity,
          parameters,
          executionEligible: false,
          skip: rejected,
          skipReason: rejected ? "rejected_experiment_memory" : null,
          artifactPaths: {
            candles: `state/research/candles/${symbol.symbol}-${granularity}s-${candleCount}.json`,
            report: `state/research/reports/${id}-${strategy.strategyId}-${symbol.symbol}-${timeframe}.json`,
          },
        });
      }
    }
  }

  return {
    schemaVersion: RESEARCH_CAMPAIGN_SCHEMA_VERSION,
    id,
    objective,
    createdAt: now.toISOString(),
    mode: "research_only",
    executionAllowed: false,
    symbolUniverse: universe,
    strategies: strategies.map(strategy => ({
      strategyId: strategy.strategyId,
      version: strategy.version,
      lifecycleState: strategy.lifecycleState,
      family: strategy.family,
      approvalStatus: strategy.approvalStatus,
    })),
    evidenceFlow: [
      { id: "resolve_symbol_universe", output: "Deriv active_symbols or repo fallback catalogue" },
      { id: "fetch_research_candles", output: "ignored candle JSON under state/research/candles" },
      { id: "train_test_split", output: "in-sample and out-of-sample metric blocks" },
      { id: "walk_forward_validation", output: "walk-forward degradation metrics before promotion" },
      { id: "ledger_decision", output: "promoted and rejected experiments appended to the experiment ledger" },
    ],
    batchPlan,
    stopConditions: [
      "Do not write .env from a research campaign.",
      "Do not write state/backtest-approved.json from local research scoring.",
      "Do not mark any strategy-symbol pair execution-eligible without strategy-scoped promotion evidence.",
    ],
  };
}

