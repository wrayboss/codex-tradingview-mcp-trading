import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { atrSeries, emaSeries, rsiSeries } from "./indicators.js";
import { resolveResearchSymbol } from "./derivSymbolRegistry.js";
import { generateStrategyCandidates } from "./strategyAutonomy.js";
import { derivAccountMode, isDerivRealAccount } from "./derivAccountMode.js";
import { isApprovalGrantedFor } from "./strategyApproval.js";

export function buildJarvisRoadmap() {
  return {
    mode: "guarded_trading_copilot",
    layers: [
      { id: "tradingview_command_center", outcome: "Verify chart, symbol, timeframe, indicators, Pine state, screenshots, and account context." },
      { id: "live_chart_analyst", outcome: "Read candles and chart context into bias, setup quality, invalidation, risk, and next action." },
      { id: "autonomous_watchlist_scanner", outcome: "Scan configured symbols and research symbols, ranking setups without widening execution." },
      { id: "strategy_builder", outcome: "Generate and document candidate strategy ideas for local research scoring." },
      { id: "backtest_operator", outcome: "Prepare Pine compile, TradingView Strategy Tester export, and validate-backtest gates." },
      { id: "trade_desk_mode", outcome: "Run fail-closed pre-trade checks before any explicit demo/live execution request." },
      { id: "memory_journal_layer", outcome: "Persist ignored research reports for later comparison and rejection/promotion rationale." },
    ],
    guardrails: [
      "Never print DERIV_API_TOKEN.",
      "Never edit .env, rules.json, or state/backtest-approved.json from Jarvis research commands.",
      "Research access does not make a symbol execution-eligible.",
      "Execution promotion requires TradingView exports and npm run validate-backtest <csv...>.",
      "Live/demo execution requires an explicit current-chat request and verified gates.",
    ],
  };
}

function redactAccount(account = null) {
  if (!account) return null;
  return {
    loginid: account.loginid,
    is_virtual: account.is_virtual,
    currency: account.currency,
    balance: account.balance,
  };
}

export function buildCommandCenter({
  chartState = null,
  indicators = [],
  accountSummary = null,
  screenshot = null,
  symbol = "VOLATILITY_75",
  timeframe = "15",
  pineErrors = null,
} = {}) {
  const targetCount = Number(chartState?.targetCount || chartState?.targets?.length || 0);
  const resolved = resolveResearchSymbol(symbol);
  const indicatorRows = Array.isArray(indicators) ? indicators : indicators?.indicators || [];
  const blockers = [];
  if (targetCount < 1) blockers.push("TradingView CDP target not confirmed.");
  if (pineErrors?.hasErrors) blockers.push("Visible Pine errors must be resolved before backtest/export claims.");

  return {
    status: blockers.length ? "blocked" : "ready",
    mode: "command_center",
    chart: {
      symbol: resolved.symbol,
      derivSymbol: resolved.derivSymbol,
      tradingViewSymbol: resolved.tradingViewSymbol,
      executionEligible: resolved.executionSupported,
      timeframe: String(timeframe),
      targetCount,
      indicatorCount: indicatorRows.length,
      indicators: indicatorRows.map(item => ({ name: item.name, title: item.title, rowText: item.rowText })).slice(0, 20),
      screenshot: screenshot ? { path: screenshot.path, bytes: screenshot.bytes, mimeType: screenshot.mimeType } : null,
      pineErrors: pineErrors ? { hasErrors: Boolean(pineErrors.hasErrors), errors: pineErrors.errors || [] } : null,
    },
    account: redactAccount(accountSummary),
    blockers,
    guardrails: buildJarvisRoadmap().guardrails,
  };
}

function normalizeCandles(candles = []) {
  return candles.map((candle, index) => ({
    epoch: Number(candle.epoch ?? index),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  })).filter(candle => ["open", "high", "low", "close"].every(key => Number.isFinite(candle[key])));
}

export function analyzeChartCandles({ symbol = "VOLATILITY_75", timeframe = "15", candles = [], rules = {} } = {}) {
  const resolved = resolveResearchSymbol(symbol);
  const normalized = normalizeCandles(candles);
  if (normalized.length < 20) {
    return {
      symbol: resolved.symbol,
      timeframe: String(timeframe),
      executionEligible: resolved.executionSupported,
      executionApproved: false,
      bias: "neutral",
      nextAction: "skip",
      setupState: "insufficient_candles",
      signalScore: 0,
      indicators: { ema: null, rsi: null, atr: null },
      invalidation: "Need at least 20 candles before chart analysis.",
    };
  }

  const closes = normalized.map(candle => candle.close);
  const emaPeriod = rules.indicators?.ema?.period || 50;
  const rsiPeriod = rules.indicators?.rsi?.period || 14;
  const atrPeriod = rules.indicators?.atr?.period || 14;
  const ema = emaSeries(closes, emaPeriod).at(-1);
  const rsi = rsiSeries(closes, rsiPeriod).at(-1);
  const atr = atrSeries(normalized, atrPeriod).at(-1);
  const last = normalized.at(-1);
  const prior = normalized.at(-2);
  const slope = last.close - prior.close;
  const bullish = ema != null && rsi != null && last.close > ema && rsi >= 55 && slope > 0;
  const bearish = ema != null && rsi != null && last.close < ema && rsi <= 45 && slope < 0;
  const bias = bullish ? "bullish" : bearish ? "bearish" : "neutral";
  const signalScore = Number((
    (bias === "bullish" || bias === "bearish" ? 40 : 10)
    + Math.min(Math.abs(rsi != null ? rsi - 50 : 0), 30)
    + Math.min(Math.abs(slope), 20)
  ).toFixed(4));
  const nextAction = signalScore >= 65 ? "watch" : signalScore >= 25 ? "wait" : "skip";

  return {
    symbol: resolved.symbol,
    derivSymbol: resolved.derivSymbol,
    tradingViewSymbol: resolved.tradingViewSymbol,
    timeframe: String(timeframe),
    executionEligible: resolved.executionSupported,
    executionApproved: false,
    bias,
    nextAction,
    setupState: bias === "neutral" ? "no_clear_edge" : "momentum_watch",
    signalScore,
    indicators: { ema, rsi, atr },
    invalidation: atr ? `${bias === "bearish" ? "above" : "below"} ${(last.close + (bias === "bearish" ? atr : -atr)).toFixed(4)}` : "ATR unavailable",
    lastCandle: last,
  };
}

function actionRank(action) {
  if (action === "watch") return 3;
  if (action === "wait") return 2;
  return 1;
}

export function scanWatchlist({ symbolCandles = {}, rules = {}, timeframe = "15" } = {}) {
  const results = Object.entries(symbolCandles).map(([symbol, candles]) => analyzeChartCandles({ symbol, candles, rules, timeframe }))
    .sort((a, b) => {
      const actionDelta = actionRank(b.nextAction) - actionRank(a.nextAction);
      if (actionDelta) return actionDelta;
      return b.signalScore - a.signalScore;
    })
    .map((item, index) => ({ rank: index + 1, ...item }));
  return {
    mode: "watchlist_scan",
    executionApproved: false,
    results,
  };
}

function resolveSymbols(symbols = ["VOLATILITY_75", "VOLATILITY_50"]) {
  return symbols.map(symbol => {
    const resolved = resolveResearchSymbol(symbol);
    return {
      symbol: resolved.symbol,
      derivSymbol: resolved.derivSymbol,
      tradingViewSymbol: resolved.tradingViewSymbol,
      executionEligible: resolved.executionSupported,
    };
  });
}

function uniqueSymbols(symbols = []) {
  const seen = new Set();
  const result = [];
  for (const symbol of symbols) {
    const normalized = String(symbol || "").trim();
    if (!normalized || seen.has(normalized.toUpperCase())) continue;
    seen.add(normalized.toUpperCase());
    result.push(normalized);
  }
  return result;
}

export function buildMorningBriefPlan({
  symbols = ["VOLATILITY_75", "VOLATILITY_50"],
  includeResearch = [],
  structureTimeframe = "60",
  entryTimeframe = "15",
  rules = {},
  runtimeHealth = null,
  toolAvailability = {},
} = {}) {
  const executionSymbols = uniqueSymbols(symbols.length ? symbols : ["VOLATILITY_75", "VOLATILITY_50"]);
  const researchSymbols = uniqueSymbols(includeResearch);
  const resolvedSymbols = [...executionSymbols, ...researchSymbols]
    .map(symbol => {
      const resolved = resolveResearchSymbol(symbol);
      const researchOnly = !resolved.executionSupported || researchSymbols.some(item => item.toUpperCase() === symbol.toUpperCase());
      return {
        symbol: resolved.symbol,
        derivSymbol: resolved.derivSymbol,
        tradingViewSymbol: resolved.tradingViewSymbol,
        displayName: resolved.displayName,
        executionEligible: researchOnly ? false : resolved.executionSupported,
        researchOnly,
      };
    });

  return {
    mode: "jarvis_morning_brief",
    readOnly: true,
    tradeExecutionAllowed: false,
    schedulingEnabled: false,
    liveTradingEnabled: false,
    tokenRequired: false,
    structureTimeframe: String(structureTimeframe || rules.timeframes?.structure || "60"),
    entryTimeframe: String(entryTimeframe || rules.timeframes?.entry || "15"),
    symbols: resolvedSymbols,
    runtimeHealth,
    toolAvailability: {
      tv_set_chart: Boolean(toolAvailability.tv_set_chart),
      tv_capture_screenshot: Boolean(toolAvailability.tv_capture_screenshot),
      tv_get_pine_errors: Boolean(toolAvailability.tv_get_pine_errors),
      deriv_research_candles: Boolean(toolAvailability.deriv_research_candles),
      jarvis_scan_watchlist: Boolean(toolAvailability.jarvis_scan_watchlist),
      ...toolAvailability,
    },
    recommendedTradingViewTasks: [
      { id: "set_chart", tool: "tv_research_set_chart", readOnly: true, description: "Set each symbol chart to the structure and entry timeframes." },
      { id: "capture_screenshot", tool: "tv_capture_screenshot", readOnly: true, description: "Capture chart evidence for operator review only." },
      { id: "inspect_pine_errors", tool: "tv_get_pine_errors", readOnly: true, description: "Inspect visible Pine errors before any backtest/export claims." },
      { id: "analyze_candles", tool: "jarvis_analyze_chart", readOnly: true, description: "Summarize candles into bias, setup quality, invalidation, and blockers." },
      { id: "scan_watchlist", tool: "jarvis_scan_watchlist", readOnly: true, description: "Rank watchlist candidates without changing execution eligibility." },
    ],
    analysisPrompt: [
      "Summarize structure, bias, setup quality, invalidation, risk notes, and blockers.",
      "Use V75/V50 execution boundaries and mark research-only symbols clearly.",
      "Provide no trade execution, no Deriv proposal, no Deriv buy, and no scheduling instruction.",
    ].join(" "),
    safety: {
      placesOrders: false,
      callsDerivBuyOrProposal: false,
      schedulesAutomation: false,
      writesRuntimeState: false,
      changesStrategy: false,
    },
  };
}

export function buildStrategyBuilderBrief({ objective = "improve strategy evidence", symbols = ["VOLATILITY_75", "VOLATILITY_50"] } = {}) {
  return {
    mode: "research_only",
    objective,
    symbols: resolveSymbols(symbols),
    steps: [
      { id: "fetch_research_candles", command: "npm run research:candles -- <symbol> --count=1000 --granularity=900 --json" },
      { id: "generate_candidates", command: "npm run codex:autonomy -- backtest --file <candle-json> --json" },
      { id: "review_candidate_quality", command: "reject weak, overfit, low-trade, or high-drawdown candidates" },
      { id: "pine_translation", command: "translate only promoted candidates into Pine after local evidence" },
      { id: "promotion_gate", command: "npm run validate-backtest <tv-export.csv...>" },
    ],
    executionApproved: false,
  };
}

export function buildBacktestOperatorChecklist({ symbols = ["VOLATILITY_75", "VOLATILITY_50"], pineFile = "pine/breakout_retest_v1.pine" } = {}) {
  return {
    mode: "backtest_operator",
    symbols: resolveSymbols(symbols),
    pineFile,
    steps: [
      { id: "chart_setup", command: "tv_set_chart for V75/V50 or tv_research_set_chart for research-only symbols" },
      { id: "pine_compile_check", command: `load ${pineFile}, compile in TradingView, and verify no Pine errors` },
      { id: "export_strategy_tester_trades", command: "TradingView Strategy Tester -> List of Trades -> Export CSV" },
      { id: "validate_backtest", command: "npm run validate-backtest <tv-export.csv...>" },
      { id: "approval_review", command: "read state/backtest-approved.json and report failed gates" },
    ],
    writesApprovalOnlyViaValidator: true,
  };
}

function normalizeStrategyTesterSummary(summary = null) {
  if (!summary || typeof summary !== "object") {
    return {
      hasSummary: false,
      invalidData: false,
      metrics: {},
      availableMetricFields: [],
      missing: true,
    };
  }
  const metrics = summary.metrics && typeof summary.metrics === "object" ? summary.metrics : {};
  return {
    hasSummary: Boolean(summary.hasSummary),
    invalidData: Boolean(summary.invalidData),
    metrics,
    availableMetricFields: Object.keys(metrics).sort(),
    rawText: summary.rawText,
  };
}

function metricNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").replace(/%$/, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "\u2014") return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function metricDeltas(currentMetrics = {}, researchMetrics = {}) {
  const fields = [
    "totalPnl",
    "totalPnlPercent",
    "maxEquityDrawdown",
    "maxEquityDrawdownPercent",
    "totalTrades",
    "profitableTrades",
    "profitFactor",
  ];

  return fields.map(field => {
    const current = currentMetrics[field];
    const research = researchMetrics[field];
    const currentNumber = metricNumber(current);
    const researchNumber = metricNumber(research);
    return {
      field,
      current,
      research,
      delta: currentNumber == null || researchNumber == null
        ? null
        : Number((researchNumber - currentNumber).toFixed(6)),
      comparable: currentNumber != null && researchNumber != null,
    };
  });
}

function researchV75Evidence() {
  return generateStrategyCandidates({ symbol: "VOLATILITY_75" })
    .find(candidate => candidate.id === "VOLATILITY_75-ema-rsi-momentum-research-v1")?.evidence || null;
}

export function buildStrategyCompareSurface({
  rules = {},
  currentSummary = null,
  researchSummary = null,
  currentStrategyName = "Breakout Retest V1",
  researchStrategyName = "V75 EMA RSI Momentum Research V1",
} = {}) {
  const currentTvSummary = normalizeStrategyTesterSummary(currentSummary);
  const researchTvSummary = normalizeStrategyTesterSummary(researchSummary);
  const executionSymbols = Array.isArray(rules.symbols) && rules.symbols.length ? rules.symbols : ["VOLATILITY_75", "VOLATILITY_50"];
  const researchSymbol = resolveResearchSymbol("VOLATILITY_75");
  const localEvidence = researchV75Evidence();
  const deltas = metricDeltas(currentTvSummary.metrics, researchTvSummary.metrics);
  const comparableDeltas = deltas.filter(item => item.comparable);
  const blockers = [];
  if (!currentTvSummary.hasSummary) blockers.push("Current executable Strategy Tester summary is missing; attach Breakout Retest V1 and read visible summary metrics.");
  if (!researchTvSummary.hasSummary) blockers.push("Research candidate Strategy Tester summary is missing; attach V75 EMA RSI Momentum Research V1 and read visible summary metrics.");
  if (currentTvSummary.invalidData) blockers.push("Current executable Strategy Tester summary reports INVALID DATA.");
  if (researchTvSummary.invalidData) blockers.push("Research candidate Strategy Tester summary reports INVALID DATA.");
  if (!comparableDeltas.length) blockers.push("No comparable TradingView summary metric deltas are available yet.");

  return {
    mode: "jarvis_strategy_compare",
    readOnly: true,
    tradeExecutionAllowed: false,
    liveTradingEnabled: false,
    tokenRequired: false,
    writesRuntimeState: false,
    currentExecutable: {
      name: currentStrategyName,
      strategyId: rules.strategy || "breakout_retest_v1",
      pineFile: "pine/breakout_retest_v1.pine",
      symbols: executionSymbols.map(symbol => {
        const resolved = resolveResearchSymbol(symbol);
        return {
          symbol: resolved.symbol,
          derivSymbol: resolved.derivSymbol,
          tradingViewSymbol: resolved.tradingViewSymbol,
          executionEligible: resolved.executionSupported,
        };
      }),
      entryTimeframe: String(rules.timeframes?.entry || "15"),
      structureTimeframe: String(rules.timeframes?.structure || "60"),
      executionEligible: true,
      localEvidence: {
        status: "runtime_strategy",
        source: "rules.json and pine/breakout_retest_v1.pine",
        summary: rules.description || "1H breakout/retest with EMA/RSI trend filter.",
      },
      tradingViewSummary: currentTvSummary,
    },
    researchCandidate: {
      name: researchStrategyName,
      strategyId: "v75_ema_rsi_momentum_research_v1",
      pineFile: "pine/v75_ema_rsi_momentum_research_v1.pine",
      symbol: {
        symbol: researchSymbol.symbol,
        derivSymbol: researchSymbol.derivSymbol,
        tradingViewSymbol: researchSymbol.tradingViewSymbol,
        executionEligible: false,
      },
      executionEligible: false,
      promotionRequired: true,
      localEvidence,
      tradingViewSummary: researchTvSummary,
    },
    metricDeltas: deltas,
    boundaries: [
      "This compare surface is read-only and does not place orders.",
      "The research Pine remains execution-ineligible until strategy scope, tests, TradingView export validation, and approval gates are intentionally promoted.",
      "Do not use this output as demo/live approval; use npm run validate-backtest <tv-export.csv...> on exported Strategy Tester trades.",
    ],
    blockers,
    nextConcreteStep: blockers.length
      ? "In TradingView, attach both saved Pine strategies on DERIV:VOLATILITY_75_INDEX 15m, read Strategy Tester summaries for each, then rerun this compare with --current-summary and --research-summary."
      : "Export the research candidate Strategy Tester List of Trades CSV and run npm run validate-backtest <tv-export.csv...>; review state/backtest-approved.json before any explicit demo/live promotion discussion.",
  };
}

function gate(id, label, pass, detail) {
  return { id, label, pass: Boolean(pass), detail };
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function buildTradeDeskChecklist({
  explicitExecutionRequest = false,
  account = null,
  approval = null,
  openPositions = [],
  env = process.env,
} = {}) {
  const symbol = env.SYMBOL || "VOLATILITY_75";
  let symbolResolved = null;
  try { symbolResolved = resolveResearchSymbol(symbol); } catch {}
  const mode = derivAccountMode(account);
  const isReal = isDerivRealAccount(account);
  const approvalResult = isApprovalGrantedFor({
    approval,
    symbol: symbolResolved?.symbol || symbol,
    accountMode: isReal ? "real" : "demo",
  });
  const approvalPass = approvalResult.ok;
  const openPositionCount = Array.isArray(openPositions) ? openPositions.length : null;
  const gates = [
    gate("explicit_current_request", "Explicit execution request in current conversation", explicitExecutionRequest, explicitExecutionRequest ? "present" : "missing"),
    gate("account_authorized", "Deriv account metadata verified", Boolean(account?.loginid), account?.loginid ? `${mode}:${account.loginid}` : "missing"),
    gate("backtest_approval", isReal ? "Real approval gate" : "Demo approval gate", approvalPass, approvalPass ? "approved" : approvalResult.reason),
    gate("open_positions_checked", "Open position check", Array.isArray(openPositions), Array.isArray(openPositions) ? "checked" : "not checked"),
    gate("no_open_positions", "No open Deriv positions", Array.isArray(openPositions) && openPositions.length === 0, openPositionCount == null ? "unknown" : `${openPositionCount} open position(s)`),
    gate("symbol_execution_supported", "Symbol is execution-supported", Boolean(symbolResolved?.executionSupported), symbol),
    gate("stake_present", "STAKE_USD positive", positiveNumber(env.STAKE_USD), positiveNumber(env.STAKE_USD) ? `${env.STAKE_USD}` : "STAKE_USD must be a positive number"),
    gate("stop_loss_present", "STOP_LOSS_USD positive", positiveNumber(env.STOP_LOSS_USD), positiveNumber(env.STOP_LOSS_USD) ? `${env.STOP_LOSS_USD}` : "STOP_LOSS_USD must be a positive number"),
    gate("real_account_extra_lock", "Real account lock", !isReal || (env.ALLOW_REAL_TRADING === "true" && env.DERIV_ALLOWED_REAL_LOGINID === account?.loginid), !isReal ? "demo account" : "requires ALLOW_REAL_TRADING and login match"),
  ];
  return {
    mode: "trade_desk_check",
    allowed: gates.every(item => item.pass),
    symbol,
    account: redactAccount(account),
    gates,
    command: "npm run dry-run before npm run trade or npm run loop",
  };
}

export function writeJarvisReport({ report, outputDir = path.join("state", "research", "reports"), now = new Date() } = {}) {
  if (!report || typeof report !== "object") throw new Error("report object is required.");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const kind = String(report.kind || report.mode || "jarvis-report").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const outputPath = path.join(outputDir, `${stamp}-${kind}.json`);
  const payload = { generatedAt: now.toISOString(), ...report };
  const text = JSON.stringify(payload, null, 2);
  writeFileSync(outputPath, text);
  return { path: outputPath, bytes: Buffer.byteLength(text), kind };
}
