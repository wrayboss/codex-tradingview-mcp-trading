import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { atrSeries, emaSeries, rsiSeries } from "./indicators.js";
import { resolveResearchSymbol } from "./derivSymbolRegistry.js";

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

function gate(id, label, pass, detail) {
  return { id, label, pass: Boolean(pass), detail };
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
  const isVirtual = account?.is_virtual !== false;
  const approvalPass = isVirtual ? approval?.demoApproved === true : approval?.realApproved === true;
  const gates = [
    gate("explicit_current_request", "Explicit execution request in current conversation", explicitExecutionRequest, explicitExecutionRequest ? "present" : "missing"),
    gate("account_authorized", "Deriv account metadata verified", Boolean(account?.loginid), account?.loginid || "missing"),
    gate("backtest_approval", isVirtual ? "Demo approval gate" : "Real approval gate", approvalPass, approvalPass ? "approved" : "missing or false"),
    gate("no_open_positions", "No open Deriv positions", openPositions.length === 0, `${openPositions.length} open position(s)`),
    gate("symbol_execution_supported", "Symbol is execution-supported", Boolean(symbolResolved?.executionSupported), symbol),
    gate("stake_present", "STAKE_USD present", Boolean(env.STAKE_USD), env.STAKE_USD ? "present" : "missing"),
    gate("stop_loss_present", "STOP_LOSS_USD present", Boolean(env.STOP_LOSS_USD), env.STOP_LOSS_USD ? "present" : "missing"),
    gate("real_account_extra_lock", "Real account lock", isVirtual || (env.ALLOW_REAL_TRADING === "true" && env.DERIV_ALLOWED_REAL_LOGINID === account?.loginid), isVirtual ? "demo account" : "requires ALLOW_REAL_TRADING and login match"),
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
