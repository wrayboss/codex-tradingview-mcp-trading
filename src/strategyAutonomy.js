import { existsSync, readFileSync } from "fs";
import path from "path";
import { atrSeries, emaSeries, rsiSeries } from "./indicators.js";
import { getResearchSymbolCatalog, resolveResearchSymbol } from "./derivSymbolRegistry.js";
import { getOperatorWatchlist } from "./watchlist.js";

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

export function generateStrategyCandidates({ symbol = "VOLATILITY_75" } = {}) {
  const resolved = resolveResearchSymbol(symbol);
  const base = {
    symbol: resolved.symbol,
    derivSymbol: resolved.derivSymbol,
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
    {
      ...base,
      id: `${resolved.symbol}-rsi-mean-reversion`,
      name: "RSI mean reversion",
      family: "rsi_mean_reversion",
      params: { emaPeriod: 34, rsiPeriod: 14, rsiLong: 35, rsiShort: 65, holdBars: 6, stopAtr: 1.0, takeProfitAtr: 1.5 },
    },
  ];

  if (resolved.symbol === "VOLATILITY_75") {
    candidates.splice(2, 0, {
      ...base,
      id: `${resolved.symbol}-ema-rsi-momentum-research-v1`,
      name: "EMA/RSI momentum research V1",
      family: "ema_rsi_momentum",
      params: { emaPeriod: 144, rsiPeriod: 14, rsiLong: 62, rsiShort: 38, holdBars: 8, stopAtr: 2.0, takeProfitAtr: 3.0 },
      evidence: {
        source: "VOLATILITY_75 15m Deriv candles, 5000 bars, split 3500 train / 1500 test",
        train: { trades: 211, winRate: 0.5639810426540285, profitFactor: 1.340058065134998, netPoints: 8904.747468741924, maxDrawdownPoints: 2930.2772896084643 },
        test: { trades: 77, winRate: 0.5714285714285714, profitFactor: 2.0639207799275434, netPoints: 7505.44157069494, maxDrawdownPoints: 958.7591150771841 },
        executionApproved: false,
      },
    });
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

function signalForCandidate(candidate, candle, ema, rsi) {
  if (candidate.family === "rsi_mean_reversion") {
    if (candle.close < ema && rsi <= candidate.params.rsiLong) return "long";
    if (candle.close > ema && rsi >= candidate.params.rsiShort) return "short";
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
  const warmup = Math.max(candidate.params.emaPeriod, candidate.params.rsiPeriod + 1, 15);

  for (let i = warmup; i < normalizedCandles.length - candidate.params.holdBars; i++) {
    if (ema[i] == null || rsi[i] == null || atr[i] == null || atr[i] <= 0) continue;
    const side = signalForCandidate(candidate, normalizedCandles[i], ema[i], rsi[i]);
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
