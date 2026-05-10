import { existsSync, readFileSync } from "fs";
import path from "path";
import { atrSeries, emaSeries, rsiSeries } from "./indicators.js";
import { getResearchSymbolCatalog, resolveResearchSymbol } from "./derivSymbolRegistry.js";
import { getOperatorWatchlist } from "./watchlist.js";
import { DEFAULT_EXPERIMENT_LEDGER } from "./experimentLedger.js";
import { buildResearchCampaign } from "./researchCampaigns.js";
import { discoverStrategies } from "./strategyRegistry.js";

function safePackageJson(rootDir = process.cwd()) {
  try {
    return JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  } catch {
    return { name: "unknown", version: "unknown" };
  }
}

function defaultExecutionSymbols() {
  return getOperatorWatchlist().map(item => item.symbol);
}

export function buildAutonomyStatus({
  env = process.env,
  packageJson = safePackageJson(),
  executionSymbols = defaultExecutionSymbols(),
  researchCatalog = getResearchSymbolCatalog(),
  strategyRegistry = discoverStrategies(),
  backtestApprovalExists = existsSync(path.join(process.cwd(), "state", "backtest-approved.json")),
} = {}) {
  const token = env.DERIV_API_TOKEN || "";
  const liveToolAvailable = env.CODEX_ALLOW_LIVE_TRADING === "true";
  const executionEligibleCount = researchCatalog.filter(item => item.executionSupported).length;

  return {
    mode: "research_only",
    package: {
      name: packageJson.name,
      version: packageJson.version,
    },
    env: {
      DERIV_API_TOKEN_set: Boolean(token && !token.startsWith("your_") && token.length > 8),
      DERIV_APP_ID_set: Boolean(env.DERIV_APP_ID),
    },
    capabilities: [
      {
        id: "symbol_research",
        command: "npm run research:symbols",
        sideEffects: "read-only Deriv active_symbols lookup",
      },
      {
        id: "research_candle_fetch",
        command: "npm run research:candles -- <symbol> --count=500 --granularity=900",
        sideEffects: "writes ignored JSON under state/research/candles",
      },
      {
        id: "candidate_strategy_backtest",
        command: "npm run codex:autonomy -- backtest --file <state/research/candles/file.json>",
        sideEffects: "local research scoring only; no orders and no approval artifact",
      },
      {
        id: "research_campaign_plan",
        command: "buildResearchCampaign({ symbols, strategies, timeframes })",
        sideEffects: "read-only mission definition; no orders and no approval artifact",
      },
      {
        id: "experiment_ledger",
        command: `appendExperiment({ filePath: "${DEFAULT_EXPERIMENT_LEDGER}", experiment })`,
        sideEffects: "appends promoted or rejected research memory under ignored state/research",
      },
      {
        id: "multi_symbol_research_matrix",
        command: "npm run codex:autonomy -- sweep --files SYMBOL=<candle-json>,SYMBOL=<candle-json> --json",
        sideEffects: "local multi-symbol ranking only; no orders and no approval artifact",
      },
      {
        id: "promotion_gate",
        command: "npm run validate-backtest <tv-export.csv...>",
        sideEffects: "writes state/backtest-approved.json only after TradingView export validation",
      },
    ],
    research: {
      catalogCount: researchCatalog.length,
      executionEligibleCount,
      researchOnlyCount: researchCatalog.length - executionEligibleCount,
    },
    strategies: {
      count: strategyRegistry.strategies.length,
      live: strategyRegistry.byLifecycle("live").map(strategy => strategy.strategyId),
      research: strategyRegistry.byLifecycle("research").map(strategy => strategy.strategyId),
    },
    execution: {
      symbols: [...executionSymbols],
      liveToolAvailable,
      backtestApprovalExists: Boolean(backtestApprovalExists),
      liveOrdersAllowedByAutonomy: false,
      guardrails: [
        "Autonomy tools must not edit .env or rules.json.",
        "Autonomy tools must not place live/demo orders.",
        "Research symbols do not become execution-eligible without explicit strategy expansion.",
      ],
    },
    safety: {
      secretsPrinted: false,
      executionExpansion: false,
      promotionRequiresValidateBacktest: true,
    },
  };
}

export function buildAutonomyPlan({
  objective = "research and rank new strategy candidates",
  symbols = ["VOLATILITY_75", "VOLATILITY_50"],
  candleCount = 500,
  granularity = 900,
} = {}) {
  const resolvedSymbols = symbols.map(symbol => {
    const resolved = resolveResearchSymbol(symbol);
    return {
      symbol: resolved.symbol,
      derivSymbol: resolved.derivSymbol,
      tradingViewSymbol: resolved.tradingViewSymbol,
      executionEligible: resolved.executionSupported,
    };
  });

  return {
    objective,
    mode: "research_only",
    symbols: resolvedSymbols,
    campaign: buildResearchCampaign({
      id: "autonomy-campaign-draft",
      objective,
      symbols,
      timeframes: [String(granularity / 60)],
      candleCount,
      granularity,
    }),
    phases: [
      {
        id: "discover_catalog",
        command: "npm run research:symbols -- --json",
        evidence: "Deriv active_symbols or repo fallback catalogue",
      },
      {
        id: "fetch_research_candles",
        command: `npm run research:candles -- <symbol> --count=${candleCount} --granularity=${granularity} --json`,
        evidence: "ignored candle JSON under state/research/candles",
      },
      {
        id: "local_candidate_backtest",
        command: "npm run codex:autonomy -- backtest --file <candle-json> --json",
        evidence: "ranked local research metrics",
      },
      {
        id: "multi_symbol_research_matrix",
        command: "npm run codex:autonomy -- sweep --files SYMBOL=<candle-json>,SYMBOL=<candle-json> --json",
        evidence: "top symbols, top families, train/test/recent robustness, rejection notes",
      },
      {
        id: "strategy_review",
        command: "inspect generated metrics, reject weak or overfit candidates",
        evidence: "candidate notes and rejected/promoted rationale",
      },
      {
        id: "promotion_gate",
        command: "npm run validate-backtest <tv-export.csv...>",
        evidence: "state/backtest-approved.json from TradingView List of Trades export",
      },
    ],
    stopConditions: [
      "Stop before editing execution symbols, rules.json, or .env.",
      "Stop before npm run trade or npm run loop.",
      "Stop unless npm run validate-backtest proves the promoted strategy with exported TradingView trades.",
    ],
  };
}

export const DEFAULT_RESEARCH_GATES = Object.freeze({
  profitFactor: 1.6,
  maxDrawdownPercent: 0.15,
  minFullTrades: 20,
  minSplitTrades: 5,
  trainRatio: 0.7,
  testRatio: 0.2,
  recentRatio: 0.1,
});

function isCrashBoomSymbol(symbol) {
  return /^BOOM_|^CRASH_/.test(symbol);
}

function isJumpSymbol(symbol) {
  return /^JUMP_/.test(symbol);
}

function isStepSymbol(symbol) {
  return /^STEP_/.test(symbol);
}

function isVolatilitySymbol(symbol) {
  return /^VOLATILITY_/.test(symbol);
}

function spikeDirectionForSymbol(symbol) {
  if (symbol.startsWith("BOOM_")) return "up";
  if (symbol.startsWith("CRASH_")) return "down";
  return "both";
}

function sideForDirection(direction) {
  if (direction === "up") return "long";
  if (direction === "down") return "short";
  return null;
}

function oppositeSide(side) {
  if (side === "long") return "short";
  if (side === "short") return "long";
  return null;
}

function addCrashBoomCandidates(candidates, base, resolved) {
  const spikeDirection = spikeDirectionForSymbol(resolved.symbol);
  const spikeSide = sideForDirection(spikeDirection);
  const fadeSide = oppositeSide(spikeSide);
  candidates.push(
    {
      ...base,
      id: `${resolved.symbol}-spike-fade`,
      name: "Spike fade",
      family: "spike_fade",
      params: { emaPeriod: 34, rsiPeriod: 14, spikeDirection, entrySide: fadeSide, spikeAtr: 2.8, holdBars: 4, stopAtr: 1.1, takeProfitAtr: 1.4 },
    },
    {
      ...base,
      id: `${resolved.symbol}-spike-continuation`,
      name: "Spike continuation",
      family: "spike_continuation",
      params: { emaPeriod: 21, rsiPeriod: 14, spikeDirection, entrySide: spikeSide, spikeAtr: 3.0, holdBars: 3, stopAtr: 1.0, takeProfitAtr: 1.8 },
    },
    {
      ...base,
      id: `${resolved.symbol}-post-spike-cooldown`,
      name: "Post-spike cooldown",
      family: "post_spike_cooldown",
      params: { emaPeriod: 34, rsiPeriod: 14, spikeDirection, entrySide: fadeSide, spikeAtr: 2.5, cooldownBars: 5, holdBars: 5, stopAtr: 1.2, takeProfitAtr: 1.5 },
    },
    {
      ...base,
      id: `${resolved.symbol}-compression-before-spike`,
      name: "Compression before spike",
      family: "compression_before_spike",
      params: { emaPeriod: 21, rsiPeriod: 14, spikeDirection, entrySide: spikeSide, compressionLookback: 8, breakoutLookback: 8, compressionRatio: 0.75, holdBars: 4, stopAtr: 1.0, takeProfitAtr: 1.7 },
    },
  );
}

function addJumpCandidates(candidates, base, resolved) {
  candidates.push(
    {
      ...base,
      id: `${resolved.symbol}-jump-impulse-continuation`,
      name: "Jump impulse continuation",
      family: "jump_impulse_continuation",
      params: { emaPeriod: 21, rsiPeriod: 14, jumpAtr: 2.2, holdBars: 4, stopAtr: 1.0, takeProfitAtr: 1.8 },
    },
    {
      ...base,
      id: `${resolved.symbol}-post-jump-mean-reversion`,
      name: "Post-jump mean reversion",
      family: "post_jump_mean_reversion",
      params: { emaPeriod: 34, rsiPeriod: 14, jumpAtr: 2.0, holdBars: 5, stopAtr: 1.1, takeProfitAtr: 1.5 },
    },
    {
      ...base,
      id: `${resolved.symbol}-jump-volatility-filter`,
      name: "Jump volatility filter",
      family: "jump_volatility_filter",
      params: { emaPeriod: 50, rsiPeriod: 14, rsiLong: 55, rsiShort: 45, minAtrRatio: 0.7, holdBars: 6, stopAtr: 1.3, takeProfitAtr: 2.0 },
    },
  );
}

function addStepCandidates(candidates, base, resolved) {
  candidates.push(
    {
      ...base,
      id: `${resolved.symbol}-step-short-trend`,
      name: "Step short-hold trend",
      family: "step_short_trend",
      params: { emaPeriod: 21, rsiPeriod: 14, rsiLong: 54, rsiShort: 46, slopeLookback: 4, holdBars: 3, stopAtr: 0.9, takeProfitAtr: 1.2 },
    },
    {
      ...base,
      id: `${resolved.symbol}-step-mean-reversion`,
      name: "Step mean reversion",
      family: "step_mean_reversion",
      params: { emaPeriod: 34, rsiPeriod: 14, rsiLong: 38, rsiShort: 62, holdBars: 4, stopAtr: 0.8, takeProfitAtr: 1.1 },
    },
  );
}

function addVolatilityCandidates(candidates, base, resolved) {
  candidates.push(
    {
      ...base,
      id: `${resolved.symbol}-regime-filtered-breakout`,
      name: "Regime-filtered breakout",
      family: "regime_filtered_breakout",
      params: { emaPeriod: 50, rsiPeriod: 14, rsiLong: 56, rsiShort: 44, breakoutLookback: 12, holdBars: 6, stopAtr: 1.4, takeProfitAtr: 2.3 },
    },
    {
      ...base,
      id: `${resolved.symbol}-atr-compression-breakout`,
      name: "ATR compression breakout",
      family: "atr_compression_breakout",
      params: { emaPeriod: 34, rsiPeriod: 14, compressionLookback: 10, breakoutLookback: 10, compressionRatio: 0.7, holdBars: 5, stopAtr: 1.1, takeProfitAtr: 2.0 },
    },
    {
      ...base,
      id: `${resolved.symbol}-trend-chop-classifier`,
      name: "Trend/chop classifier",
      family: "trend_chop_classifier",
      params: { emaPeriod: 89, rsiPeriod: 14, rsiLong: 58, rsiShort: 42, slopeLookback: 8, minSlopeAtr: 0.35, holdBars: 7, stopAtr: 1.5, takeProfitAtr: 2.4 },
    },
  );
}

export function generateStrategyCandidates({ symbol = "VOLATILITY_75" } = {}) {
  const resolved = resolveResearchSymbol(symbol);
  const base = {
    symbol: resolved.symbol,
    derivSymbol: resolved.derivSymbol,
    tradingViewSymbol: resolved.tradingViewSymbol,
    executionEligible: resolved.executionSupported,
    executionApproved: false,
    promotionRequired: true,
  };

  const candidates = [
    {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-fast`,
      name: "EMA/RSI momentum fast",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 21, rsiPeriod: 14, rsiLong: 55, rsiShort: 45, holdBars: 4, stopAtr: 1.2, takeProfitAtr: 2.0 },
    },
    {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-slow`,
      name: "EMA/RSI momentum slow",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 50, rsiPeriod: 14, rsiLong: 58, rsiShort: 42, holdBars: 8, stopAtr: 1.5, takeProfitAtr: 2.5 },
    },
  ];

  const genericMeanReversion = {
    ...base,
    id: `${resolved.symbol}-rsi-mean-reversion`,
    name: "RSI mean reversion",
    family: "rsi_mean_reversion",
    params: { emaPeriod: 34, rsiPeriod: 14, rsiLong: 35, rsiShort: 65, holdBars: 6, stopAtr: 1.0, takeProfitAtr: 1.5 },
  };

  if (resolved.symbol === "VOLATILITY_75") {
    candidates.push({
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v7`,
      name: "EMA/RSI momentum research V7",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 175, rsiPeriod: 14, rsiLong: 60, rsiShort: 38, holdBars: 8, stopAtr: 2.5, takeProfitAtr: 3.5 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 10000 bars, split 7000 train / 2000 test / 1000 recent holdout",
        full: { trades: 616, winRate: 0.5405844155844156, profitFactor: 1.242195308279814, netPoints: 18643.789150694796, maxDrawdownPoints: 3881.748389356704 },
        train: { trades: 431, winRate: 0.5336426914153132, profitFactor: 1.1786293975928488, netPoints: 9677.366947240109, maxDrawdownPoints: 3881.748389356704 },
        test: { trades: 105, winRate: 0.5238095238095238, profitFactor: 1.1802248001649744, netPoints: 2539.921342982416, maxDrawdownPoints: 2024.0163445611179 },
        recent: { trades: 55, winRate: 0.6181818181818182, profitFactor: 1.5667950811737528, netPoints: 3497.2346080716925, maxDrawdownPoints: 1429.9174087982901 },
        tradingView: {
          source: "TradingView Strategy Tester visible summary, DERIV:VOLATILITY_75_INDEX 15m, Sep 30 2025 - May 10 2026",
          metrics: { totalTrades: 1329, profitableTrades: "51.24%", profitFactor: 0.94, maxDrawdownPercent: "23.59%", totalPnlPercent: "-14.98%" },
          approved: false,
          blockers: [
            "Profit factor 0.94 is below approval threshold 1.6.",
            "Max drawdown 23.59% is above approval threshold 15.00%.",
          ],
        },
        executionApproved: false,
      },
    }, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v6`,
      name: "EMA/RSI momentum research V6",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 225, rsiPeriod: 14, rsiLong: 60, rsiShort: 38, holdBars: 10, stopAtr: 2.0, takeProfitAtr: 2.5 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 10000 bars, split 7000 train / 2000 test / 1000 recent holdout",
        full: { trades: 559, winRate: 0.5152057245080501, profitFactor: 1.1827030183496845, netPoints: 14222.476594422085, maxDrawdownPoints: 6649.668944159213 },
        train: { trades: 394, winRate: 0.48223350253807107, profitFactor: 1.0501719852335543, netPoints: 2911.0100218204207, maxDrawdownPoints: 6649.668944159213 },
        test: { trades: 92, winRate: 0.5760869565217391, profitFactor: 1.3679519426721365, netPoints: 4764.173617873825, maxDrawdownPoints: 2027.4252200051124 },
        recent: { trades: 44, winRate: 0.6818181818181818, profitFactor: 2.8391184716888396, netPoints: 5826.554143613306, maxDrawdownPoints: 793.1160126713221 },
        executionApproved: false,
      },
    }, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v5`,
      name: "EMA/RSI momentum research V5",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 225, rsiPeriod: 14, rsiLong: 64, rsiShort: 38, holdBars: 8, stopAtr: 2.0, takeProfitAtr: 2.5 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 10000 bars, split 7000 train / 2000 test / 1000 recent holdout",
        full: { trades: 517, winRate: 0.5357833655705996, profitFactor: 1.2482549531659248, netPoints: 15903.006707035893, maxDrawdownPoints: 4340.667857371471 },
        train: { trades: 358, winRate: 0.5279329608938548, profitFactor: 1.1033683378388557, netPoints: 4841.0303652009425, maxDrawdownPoints: 4340.667857371471 },
        test: { trades: 84, winRate: 0.5357142857142857, profitFactor: 1.3529665324892186, netPoints: 3860.723540740695, maxDrawdownPoints: 2202.2322041806437 },
        recent: { trades: 45, winRate: 0.6, profitFactor: 2.8079164027699823, netPoints: 5330.361647923477, maxDrawdownPoints: 521.3491328822784 },
        tradingView: {
          source: "TradingView Strategy Tester visible summary, DERIV:VOLATILITY_75_INDEX 15m, Sep 30 2025 - May 10 2026",
          metrics: { totalTrades: 1193, profitableTrades: "47.95%", profitFactor: 0.865, maxDrawdownPercent: "37.07%", totalPnlPercent: "-31.22%" },
          approved: false,
          blockers: [
            "Profit factor 0.865 is below approval threshold 1.6.",
            "Max drawdown 37.07% is above approval threshold 15.00%.",
          ],
        },
        executionApproved: false,
      },
    }, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v4`,
      name: "EMA/RSI momentum research V4",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 100, rsiPeriod: 14, rsiLong: 60, rsiShort: 38, holdBars: 10, stopAtr: 2.0, takeProfitAtr: 3.0 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 5000 bars, split 3500 train / 1500 test, recent 1000-bar holdout",
        full: { trades: 293, winRate: 0.5392491467576792, profitFactor: 1.3182338630277635, netPoints: 12649.022708813722, maxDrawdownPoints: 5455.9303721092 },
        train: { trades: 206, winRate: 0.5194174757281553, profitFactor: 1.114238125128982, netPoints: 3457.7362030483127, maxDrawdownPoints: 5455.9303721092 },
        test: { trades: 80, winRate: 0.5875, profitFactor: 2.0955680930961993, netPoints: 9050.37220794239, maxDrawdownPoints: 985.9321524681072 },
        recent: { trades: 55, winRate: 0.5636363636363636, profitFactor: 1.9384054460261528, netPoints: 5670.179666719967, maxDrawdownPoints: 985.9321524681072 },
        tradingView: {
          source: "TradingView Strategy Tester visible summary, DERIV:VOLATILITY_75_INDEX 15m, Sep 30 2025 - May 10 2026",
          metrics: { totalTrades: 1350, profitableTrades: "48.00%", profitFactor: 0.905, maxDrawdownPercent: "36.59%", totalPnlPercent: "-27.23%" },
          approved: false,
          blockers: [
            "Profit factor 0.905 is below approval threshold 1.6.",
            "Max drawdown 36.59% is above approval threshold 15.00%.",
          ],
        },
        executionApproved: false,
      },
    }, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v3`,
      name: "EMA/RSI momentum research V3",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 175, rsiPeriod: 14, rsiLong: 62, rsiShort: 38, holdBars: 8, stopAtr: 2.0, takeProfitAtr: 3.0 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 5000 bars, split 3500 train / 1500 test",
        full: { trades: 280, winRate: 0.5607142857142857, profitFactor: 1.4793110856781977, netPoints: 14747.757593070372, maxDrawdownPoints: 2696.2502324999004 },
        train: { trades: 193, winRate: 0.5647668393782384, profitFactor: 1.3837004958900276, netPoints: 8463.552061960625, maxDrawdownPoints: 2696.2502324999004 },
        test: { trades: 81, winRate: 0.5432098765432098, profitFactor: 1.793122185684272, netPoints: 6283.805358407815, maxDrawdownPoints: 968.6298202000689 },
        executionApproved: false,
      },
    }, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v2`,
      name: "EMA/RSI momentum research V2",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 100, rsiPeriod: 14, rsiLong: 62, rsiShort: 38, holdBars: 8, stopAtr: 2.0, takeProfitAtr: 2.5 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 5000 bars, split 3500 train / 1500 test",
        full: { trades: 319, winRate: 0.5454545454545454, profitFactor: 1.4278350925450471, netPoints: 16217.934671431583, maxDrawdownPoints: 3065.896689242043 },
        train: { trades: 224, winRate: 0.5446428571428571, profitFactor: 1.3347534194632906, netPoints: 9186.07351245845, maxDrawdownPoints: 3065.896689242043 },
        test: { trades: 89, winRate: 0.550561797752809, profitFactor: 1.7468845193866325, netPoints: 7148.342164651302, maxDrawdownPoints: 1635.936068129624 },
        executionApproved: false,
      },
    }, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v1`,
      name: "EMA/RSI momentum research V1",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 200, rsiPeriod: 14, rsiLong: 62, rsiShort: 38, holdBars: 8, stopAtr: 2.0, takeProfitAtr: 3.5 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 5000 bars, split 3500 train / 1500 test",
        full: { trades: 272, winRate: 0.5661764705882353, profitFactor: 1.5330838776449855, netPoints: 16190.550826536419, maxDrawdownPoints: 4064.284155889618 },
        train: { trades: 194, winRate: 0.5721649484536082, profitFactor: 1.3954895008042794, netPoints: 8871.892611534964, maxDrawdownPoints: 4064.284155889618 },
        test: { trades: 72, winRate: 0.5694444444444444, profitFactor: 1.9905534722036533, netPoints: 7352.085130040523, maxDrawdownPoints: 968.6298202000689 },
        executionApproved: false,
      },
    }, genericMeanReversion);
  } else if (resolved.symbol === "VOLATILITY_50") {
    candidates.push({
      ...base,
      id: `${resolved.symbol}-rsi-mean-reversion-research-v2`,
      name: "RSI mean reversion research V2",
      family: "rsi_mean_reversion",
      params: { emaPeriod: 34, rsiPeriod: 14, rsiLong: 40, rsiShort: 60, holdBars: 6, stopAtr: 1.0, takeProfitAtr: 2.0 },
      evidence: {
        source: "VOLATILITY_50 15m Deriv candles, 5000 bars, split 3500 train / 1500 test",
        full: { trades: 557, winRate: 0.4380610412926391, profitFactor: 1.1995409002697206, netPoints: 21.94302863778813, maxDrawdownPoints: 9.039347549072886 },
        train: { trades: 405, winRate: 0.42962962962962964, profitFactor: 1.1842124147685116, netPoints: 15.02433485730468, maxDrawdownPoints: 9.039347549072886 },
        test: { trades: 146, winRate: 0.4657534246575342, profitFactor: 1.273909585309509, netPoints: 7.417223449504505, maxDrawdownPoints: 4.8600977855068095 },
        executionApproved: false,
      },
    }, genericMeanReversion);
  } else {
    candidates.push(genericMeanReversion);
  }

  if (isCrashBoomSymbol(resolved.symbol)) {
    addCrashBoomCandidates(candidates, base, resolved);
  } else if (isJumpSymbol(resolved.symbol)) {
    addJumpCandidates(candidates, base, resolved);
  } else if (isStepSymbol(resolved.symbol)) {
    addStepCandidates(candidates, base, resolved);
  } else if (isVolatilitySymbol(resolved.symbol) && resolved.symbol !== "VOLATILITY_75" && resolved.symbol !== "VOLATILITY_50") {
    addVolatilityCandidates(candidates, base, resolved);
  }

  return candidates;
}

function validateCandles(candles = []) {
  if (!Array.isArray(candles) || candles.length < 20) {
    throw new Error("At least 20 candles are required for autonomy candidate backtests.");
  }
  return candles.map((candle, index) => {
    for (const key of ["open", "high", "low", "close"]) {
      if (!Number.isFinite(Number(candle[key]))) {
        throw new Error(`Invalid candle ${index}: ${key} must be numeric.`);
      }
    }
    return {
      epoch: Number(candle.epoch ?? index),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    };
  });
}

function candleRange(candle) {
  return Math.max(0, candle.high - candle.low);
}

function averageRange(candles, endIndex, lookback) {
  const start = Math.max(0, endIndex - lookback + 1);
  const slice = candles.slice(start, endIndex + 1);
  if (!slice.length) return 0;
  return slice.reduce((sum, candle) => sum + candleRange(candle), 0) / slice.length;
}

function recentHigh(candles, endIndex, lookback) {
  const start = Math.max(0, endIndex - lookback);
  return Math.max(...candles.slice(start, endIndex).map(candle => candle.high));
}

function recentLow(candles, endIndex, lookback) {
  const start = Math.max(0, endIndex - lookback);
  return Math.min(...candles.slice(start, endIndex).map(candle => candle.low));
}

function spikeEventAt({ candles, index, atrValue, threshold = 2.5, direction = "both" }) {
  if (index < 0 || !candles[index] || !Number.isFinite(atrValue) || atrValue <= 0) return null;
  const candle = candles[index];
  const minMove = atrValue * threshold;
  const move = candle.close - candle.open;
  if (direction !== "down" && move >= minMove) return { direction: "up", side: "long", candle };
  if (direction !== "up" && move <= -minMove) return { direction: "down", side: "short", candle };
  return null;
}

function findRecentSpike({ candles, index, atrValues, threshold, direction, lookback }) {
  const start = Math.max(0, index - lookback);
  for (let i = index - 1; i >= start; i--) {
    const event = spikeEventAt({ candles, index: i, atrValue: atrValues[i], threshold, direction });
    if (event) return { ...event, barsAgo: index - i };
  }
  return null;
}

function isCompressed({ candles, index, atrValue, lookback = 10, ratio = 0.75 }) {
  if (!Number.isFinite(atrValue) || atrValue <= 0) return false;
  return averageRange(candles, index - 1, lookback) <= atrValue * ratio;
}

function breakoutSignal({ candles, index, lookback = 10 }) {
  if (index <= 0) return null;
  const high = recentHigh(candles, index, lookback);
  const low = recentLow(candles, index, lookback);
  const candle = candles[index];
  if (Number.isFinite(high) && candle.close > high) return "long";
  if (Number.isFinite(low) && candle.close < low) return "short";
  return null;
}

function slopeSignal({ candles, index, lookback = 5, atrValue = 1, minSlopeAtr = 0 }) {
  const prior = candles[index - lookback];
  const current = candles[index];
  if (!prior || !current || !Number.isFinite(atrValue) || atrValue <= 0) return null;
  const slope = current.close - prior.close;
  if (slope > atrValue * minSlopeAtr) return "long";
  if (slope < -atrValue * minSlopeAtr) return "short";
  return null;
}

function signalForCandidate(candidate, context) {
  const { candle, index, candles, ema, rsi, atr, atrValues } = context;
  if (candidate.family === "rsi_mean_reversion") {
    if (candle.close < ema && rsi <= candidate.params.rsiLong) return "long";
    if (candle.close > ema && rsi >= candidate.params.rsiShort) return "short";
    return null;
  }
  if (candidate.family === "spike_fade") {
    const event = spikeEventAt({
      candles,
      index: index - 1,
      atrValue: atrValues[index - 1],
      threshold: candidate.params.spikeAtr,
      direction: candidate.params.spikeDirection,
    });
    return event ? (candidate.params.entrySide || oppositeSide(event.side)) : null;
  }
  if (candidate.family === "spike_continuation") {
    const event = spikeEventAt({
      candles,
      index: index - 1,
      atrValue: atrValues[index - 1],
      threshold: candidate.params.spikeAtr,
      direction: candidate.params.spikeDirection,
    });
    return event ? (candidate.params.entrySide || event.side) : null;
  }
  if (candidate.family === "post_spike_cooldown") {
    const event = findRecentSpike({
      candles,
      index,
      atrValues,
      threshold: candidate.params.spikeAtr,
      direction: candidate.params.spikeDirection,
      lookback: candidate.params.cooldownBars,
    });
    if (!event) return null;
    return candidate.params.entrySide || oppositeSide(event.side);
  }
  if (candidate.family === "compression_before_spike") {
    if (!isCompressed({
      candles,
      index,
      atrValue: atr,
      lookback: candidate.params.compressionLookback,
      ratio: candidate.params.compressionRatio,
    })) return null;
    const breakout = breakoutSignal({ candles, index, lookback: candidate.params.breakoutLookback });
    const expected = sideForDirection(candidate.params.spikeDirection);
    return breakout === expected ? breakout : null;
  }
  if (candidate.family === "jump_impulse_continuation") {
    const event = spikeEventAt({
      candles,
      index: index - 1,
      atrValue: atrValues[index - 1],
      threshold: candidate.params.jumpAtr,
      direction: "both",
    });
    return event?.side || null;
  }
  if (candidate.family === "post_jump_mean_reversion") {
    const event = spikeEventAt({
      candles,
      index: index - 1,
      atrValue: atrValues[index - 1],
      threshold: candidate.params.jumpAtr,
      direction: "both",
    });
    return event ? oppositeSide(event.side) : null;
  }
  if (candidate.family === "jump_volatility_filter") {
    const range = candleRange(candle);
    if (atr <= 0 || range / atr < candidate.params.minAtrRatio) return null;
    if (candle.close > ema && rsi >= candidate.params.rsiLong) return "long";
    if (candle.close < ema && rsi <= candidate.params.rsiShort) return "short";
    return null;
  }
  if (candidate.family === "step_short_trend") {
    const slope = slopeSignal({
      candles,
      index,
      lookback: candidate.params.slopeLookback,
      atrValue: atr,
    });
    if (slope === "long" && candle.close > ema && rsi >= candidate.params.rsiLong) return "long";
    if (slope === "short" && candle.close < ema && rsi <= candidate.params.rsiShort) return "short";
    return null;
  }
  if (candidate.family === "step_mean_reversion") {
    if (candle.close < ema && rsi <= candidate.params.rsiLong) return "long";
    if (candle.close > ema && rsi >= candidate.params.rsiShort) return "short";
    return null;
  }
  if (candidate.family === "regime_filtered_breakout") {
    const breakout = breakoutSignal({ candles, index, lookback: candidate.params.breakoutLookback });
    if (breakout === "long" && candle.close > ema && rsi >= candidate.params.rsiLong) return "long";
    if (breakout === "short" && candle.close < ema && rsi <= candidate.params.rsiShort) return "short";
    return null;
  }
  if (candidate.family === "atr_compression_breakout") {
    if (!isCompressed({
      candles,
      index,
      atrValue: atr,
      lookback: candidate.params.compressionLookback,
      ratio: candidate.params.compressionRatio,
    })) return null;
    return breakoutSignal({ candles, index, lookback: candidate.params.breakoutLookback });
  }
  if (candidate.family === "trend_chop_classifier") {
    const slope = slopeSignal({
      candles,
      index,
      lookback: candidate.params.slopeLookback,
      atrValue: atr,
      minSlopeAtr: candidate.params.minSlopeAtr,
    });
    if (slope === "long" && candle.close > ema && rsi >= candidate.params.rsiLong) return "long";
    if (slope === "short" && candle.close < ema && rsi <= candidate.params.rsiShort) return "short";
    return null;
  }
  if (candle.close > ema && rsi >= candidate.params.rsiLong) return "long";
  if (candle.close < ema && rsi <= candidate.params.rsiShort) return "short";
  return null;
}

function exitTrade({ candles, entryIndex, side, entry, atr, candidate }) {
  const stop = side === "long"
    ? entry - candidate.params.stopAtr * atr
    : entry + candidate.params.stopAtr * atr;
  const takeProfit = side === "long"
    ? entry + candidate.params.takeProfitAtr * atr
    : entry - candidate.params.takeProfitAtr * atr;
  const maxExit = Math.min(candles.length - 1, entryIndex + candidate.params.holdBars);

  for (let i = entryIndex + 1; i <= maxExit; i++) {
    const candle = candles[i];
    if (side === "long") {
      if (candle.low <= stop) return { exitIndex: i, exit: stop, reason: "stop" };
      if (candle.high >= takeProfit) return { exitIndex: i, exit: takeProfit, reason: "take_profit" };
    } else {
      if (candle.high >= stop) return { exitIndex: i, exit: stop, reason: "stop" };
      if (candle.low <= takeProfit) return { exitIndex: i, exit: takeProfit, reason: "take_profit" };
    }
  }
  return { exitIndex: maxExit, exit: candles[maxExit].close, reason: "time" };
}

function computeResearchMetrics(trades) {
  const wins = trades.filter(trade => trade.pnlPoints > 0);
  const losses = trades.filter(trade => trade.pnlPoints < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnlPoints, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnlPoints, 0));
  const netPoints = trades.reduce((sum, trade) => sum + trade.pnlPoints, 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdownPoints = 0;
  for (const trade of trades) {
    equity += trade.pnlPoints;
    peak = Math.max(peak, equity);
    maxDrawdownPoints = Math.max(maxDrawdownPoints, peak - equity);
  }
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    netPoints,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss,
    maxDrawdownPoints,
  };
}

function scoreMetrics(metrics) {
  const cappedPf = Number.isFinite(metrics.profitFactor) ? metrics.profitFactor : 5;
  return Number((metrics.netPoints + metrics.winRate * 10 + Math.min(cappedPf, 5) * 5 - metrics.maxDrawdownPoints).toFixed(6));
}

export function backtestCandidate({ candles, candidate }) {
  const normalizedCandles = validateCandles(candles);
  const closes = normalizedCandles.map(candle => candle.close);
  const ema = emaSeries(closes, candidate.params.emaPeriod);
  const rsi = rsiSeries(closes, candidate.params.rsiPeriod);
  const atr = atrSeries(normalizedCandles, 14);
  const trades = [];
  const warmup = Math.max(
    candidate.params.emaPeriod,
    candidate.params.rsiPeriod + 1,
    candidate.params.compressionLookback || 0,
    candidate.params.breakoutLookback || 0,
    candidate.params.slopeLookback || 0,
    candidate.params.cooldownBars || 0,
    15,
  );

  for (let i = warmup; i < normalizedCandles.length - candidate.params.holdBars; i++) {
    if (ema[i] == null || rsi[i] == null || atr[i] == null || atr[i] <= 0) continue;
    const side = signalForCandidate(candidate, {
      candle: normalizedCandles[i],
      index: i,
      candles: normalizedCandles,
      ema: ema[i],
      rsi: rsi[i],
      atr: atr[i],
      atrValues: atr,
    });
    if (!side) continue;
    const entry = normalizedCandles[i].close;
    const exit = exitTrade({ candles: normalizedCandles, entryIndex: i, side, entry, atr: atr[i], candidate });
    const pnlPoints = side === "long" ? exit.exit - entry : entry - exit.exit;
    trades.push({
      side,
      entryEpoch: normalizedCandles[i].epoch,
      exitEpoch: normalizedCandles[exit.exitIndex].epoch,
      entry,
      exit: exit.exit,
      exitReason: exit.reason,
      pnlPoints,
    });
    i = exit.exitIndex;
  }

  const metrics = computeResearchMetrics(trades);
  return {
    candidateId: candidate.id,
    name: candidate.name,
    symbol: candidate.symbol,
    family: candidate.family,
    executionApproved: false,
    promotionRequired: true,
    metrics,
    score: scoreMetrics(metrics),
    sampleTrades: trades.slice(0, 5),
  };
}

export function backtestCandidateSet({ candles, candidates = generateStrategyCandidates() } = {}) {
  return candidates.map(candidate => backtestCandidate({ candles, candidate }));
}

export function rankBacktestResults(results = []) {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.metrics.trades - a.metrics.trades;
  });
}

function splitCandlesForResearch(candles, gates) {
  const normalized = validateCandles(candles);
  const minSlice = 20;
  let recentCount = Math.max(minSlice, Math.floor(normalized.length * gates.recentRatio));
  let testCount = Math.max(minSlice, Math.floor(normalized.length * gates.testRatio));
  let trainCount = normalized.length - testCount - recentCount;
  if (trainCount < minSlice) {
    trainCount = Math.max(minSlice, Math.floor(normalized.length * gates.trainRatio));
    testCount = Math.max(minSlice, Math.floor((normalized.length - trainCount) / 2));
    recentCount = normalized.length - trainCount - testCount;
  }
  if (recentCount < minSlice || testCount < minSlice || trainCount < minSlice) {
    throw new Error("At least 60 candles are required for train/test/recent robustness checks.");
  }
  return {
    full: normalized,
    train: normalized.slice(0, trainCount),
    test: normalized.slice(trainCount, trainCount + testCount),
    recent: normalized.slice(trainCount + testCount),
  };
}

function drawdownPercent(metrics, candles) {
  const closes = candles.map(candle => Math.abs(candle.close)).filter(Number.isFinite);
  const averageClose = closes.length ? closes.reduce((sum, value) => sum + value, 0) / closes.length : 0;
  if (!averageClose) return 0;
  return metrics.maxDrawdownPoints / averageClose;
}

function summarizeBacktest(result, candles) {
  return {
    ...result,
    metrics: {
      ...result.metrics,
      maxDrawdownPercent: drawdownPercent(result.metrics, candles),
    },
    sampleTrades: undefined,
  };
}

function gateFailuresForSplit(name, result, gates) {
  const minTrades = name === "full" ? gates.minFullTrades : gates.minSplitTrades;
  const failures = [];
  const profitFactor = result.metrics.profitFactor;
  if (result.metrics.trades < minTrades) {
    failures.push(`${name} trades ${result.metrics.trades} below ${minTrades}`);
  }
  if (profitFactor !== Infinity && (!Number.isFinite(profitFactor) || profitFactor < gates.profitFactor)) {
    failures.push(`${name} profit factor ${Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : profitFactor} below ${gates.profitFactor}`);
  }
  if (result.metrics.maxDrawdownPercent > gates.maxDrawdownPercent) {
    failures.push(`${name} drawdown ${(result.metrics.maxDrawdownPercent * 100).toFixed(2)}% above ${(gates.maxDrawdownPercent * 100).toFixed(2)}%`);
  }
  return failures;
}

function robustnessScore(splits) {
  const names = ["full", "train", "test", "recent"];
  const metrics = names.map(name => splits[name].metrics);
  const finitePfs = metrics
    .map(item => item.profitFactor)
    .map(value => value === Infinity ? 5 : value)
    .filter(value => Number.isFinite(value));
  const avgPf = finitePfs.length ? finitePfs.reduce((sum, value) => sum + Math.min(value, 5), 0) / finitePfs.length : 0;
  const minPf = finitePfs.length ? Math.min(...finitePfs) : 0;
  const avgWinRate = metrics.reduce((sum, item) => sum + item.winRate, 0) / metrics.length;
  const maxDrawdownPct = Math.max(...metrics.map(item => item.maxDrawdownPercent || 0));
  const positiveNetSplits = metrics.filter(item => item.netPoints > 0).length;
  const tradeDepth = Math.min(splits.full.metrics.trades / 100, 1);
  return Number((avgPf * 100 + minPf * 60 + avgWinRate * 50 + positiveNetSplits * 10 + tradeDepth * 20 - maxDrawdownPct * 100).toFixed(6));
}

export function evaluateCandidateRobustness({
  candles,
  candidate,
  strictGates = DEFAULT_RESEARCH_GATES,
} = {}) {
  if (!candidate) throw new Error("candidate is required for robustness evaluation.");
  const gates = { ...DEFAULT_RESEARCH_GATES, ...strictGates };
  const candleSplits = splitCandlesForResearch(candles, gates);
  const splits = {};
  for (const name of ["full", "train", "test", "recent"]) {
    splits[name] = summarizeBacktest(
      backtestCandidate({ candles: candleSplits[name], candidate }),
      candleSplits[name],
    );
  }
  const fullFailures = gateFailuresForSplit("full", splits.full, gates);
  const trainFailures = gateFailuresForSplit("train", splits.train, gates);
  const testFailures = gateFailuresForSplit("test", splits.test, gates);
  const recentFailures = gateFailuresForSplit("recent", splits.recent, gates);
  const failures = [...fullFailures, ...trainFailures, ...testFailures, ...recentFailures];
  const holdoutFailures = [...trainFailures, ...testFailures, ...recentFailures];
  let status = "promoted_for_pine_review";
  if (fullFailures.length === 0 && holdoutFailures.length > 0) {
    status = "rejected_holdout_failed";
  } else if (failures.length > 0 && splits.full.metrics.profitFactor >= gates.profitFactor * 0.8 && splits.full.metrics.trades >= gates.minSplitTrades) {
    status = "watchlist";
  } else if (failures.length > 0) {
    status = "rejected";
  }
  const reasons = failures.length
    ? failures
    : [
      `all splits reached PF ${gates.profitFactor} and local drawdown stayed under ${(gates.maxDrawdownPercent * 100).toFixed(2)}%`,
      "candidate is only promoted for Pine/TradingView review, not execution",
    ];
  return {
    candidateId: candidate.id,
    name: candidate.name,
    symbol: candidate.symbol,
    family: candidate.family,
    params: candidate.params,
    executionEligible: Boolean(candidate.executionEligible),
    executionApproved: false,
    promotionRequired: true,
    promotionReadyForPine: failures.length === 0,
    status,
    reasons,
    strictGates: gates,
    splits,
    score: robustnessScore(splits),
  };
}

function symbolCandleEntries(symbolCandles = {}) {
  if (symbolCandles instanceof Map) return Array.from(symbolCandles.entries());
  if (Array.isArray(symbolCandles)) {
    return symbolCandles.map(item => [item.symbol, item.candles]);
  }
  return Object.entries(symbolCandles);
}

function bestResultsByFamily(results) {
  const byFamily = new Map();
  for (const result of results) {
    const existing = byFamily.get(result.family);
    if (!existing || result.score > existing.score) byFamily.set(result.family, result);
  }
  return [...byFamily.values()].sort((a, b) => b.score - a.score);
}

function compactRobustnessResult(result) {
  return {
    candidateId: result.candidateId,
    name: result.name,
    symbol: result.symbol,
    family: result.family,
    params: result.params,
    status: result.status,
    promotionReadyForPine: result.promotionReadyForPine,
    rejectionNotes: result.status === "promoted_for_pine_review" ? [] : result.reasons.slice(0, 4),
    score: result.score,
    executionEligible: result.executionEligible,
    executionApproved: false,
    promotionRequired: true,
    metrics: {
      full: result.splits.full.metrics,
      train: result.splits.train.metrics,
      test: result.splits.test.metrics,
      recent: result.splits.recent.metrics,
    },
  };
}

export function buildResearchMatrix({
  symbolCandles = {},
  strictGates = DEFAULT_RESEARCH_GATES,
} = {}) {
  const gates = { ...DEFAULT_RESEARCH_GATES, ...strictGates };
  const entries = symbolCandleEntries(symbolCandles);
  if (!entries.length) {
    throw new Error("research matrix requires at least one symbol candle set.");
  }
  const symbolReports = [];
  for (const [rawSymbol, candles] of entries) {
    const resolved = resolveResearchSymbol(rawSymbol);
    const normalizedCandles = validateCandles(candles);
    const candidates = generateStrategyCandidates({ symbol: resolved.symbol });
    const evaluated = candidates.map(candidate => evaluateCandidateRobustness({ candles: normalizedCandles, candidate, strictGates: gates }));
    const familyWinners = bestResultsByFamily(evaluated);
    const candidateReports = [...evaluated]
      .sort((a, b) => b.score - a.score)
      .map(compactRobustnessResult);
    const topFamilies = familyWinners.slice(0, 2).map(compactRobustnessResult);
    const rejectedFamilies = familyWinners
      .filter(result => result.status !== "promoted_for_pine_review")
      .map(result => ({
        family: result.family,
        candidateId: result.candidateId,
        status: result.status,
        reasons: result.reasons.slice(0, 3),
      }));
    symbolReports.push({
      symbol: resolved.symbol,
      derivSymbol: resolved.derivSymbol,
      tradingViewSymbol: resolved.tradingViewSymbol,
      executionEligible: resolved.executionSupported,
      executionApproved: false,
      candleCount: normalizedCandles.length,
      candidateCount: evaluated.length,
      familiesTested: familyWinners.map(result => result.family),
      candidates: candidateReports,
      topFamilies,
      rejectedFamilies,
      bestScore: topFamilies[0]?.score ?? 0,
      bestStatus: topFamilies[0]?.status || "no_candidates",
    });
  }
  const rankedSymbols = [...symbolReports].sort((a, b) => b.bestScore - a.bestScore);
  return {
    mode: "research_only",
    generatedAt: new Date().toISOString(),
    timeframe: "15m",
    candleTarget: 10000,
    strictGates: gates,
    tradeExecutionAllowed: false,
    executionApproved: false,
    promotionRequired: true,
    pineRequiresPromotion: true,
    symbols: rankedSymbols,
    shortlist: {
      topSymbols: rankedSymbols.slice(0, 3).map(symbol => ({
        symbol: symbol.symbol,
        derivSymbol: symbol.derivSymbol,
        tradingViewSymbol: symbol.tradingViewSymbol,
        bestFamily: symbol.topFamilies[0]?.family || null,
        bestStatus: symbol.bestStatus,
        score: symbol.bestScore,
        executionEligible: symbol.executionEligible,
        executionApproved: false,
      })),
      topFamiliesBySymbol: Object.fromEntries(rankedSymbols.map(symbol => [
        symbol.symbol,
        symbol.topFamilies.map(item => ({
          family: item.family,
          candidateId: item.candidateId,
          status: item.status,
          score: item.score,
          executionApproved: false,
        })),
      ])),
    },
    safety: {
      writesEnv: false,
      writesRules: false,
      writesBacktestApproval: false,
      placesOrders: false,
      expandsExecutionSymbols: false,
    },
  };
}

export function loadCandlePayload(filePath, { rootDir = process.cwd() } = {}) {
  if (!filePath) throw new Error("candle file path is required.");
  const resolved = path.resolve(rootDir, filePath);
  const root = path.resolve(rootDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("candle file must be inside the repository workspace.");
  }
  const payload = JSON.parse(readFileSync(resolved, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(payload.candles)) {
    throw new Error("candle file must contain a candles array.");
  }
  return payload;
}
