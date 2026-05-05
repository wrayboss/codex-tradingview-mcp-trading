function tradingViewSymbolFromDisplayName(displayName) {
  const core = String(displayName || "")
    .replace(/\((\d+)s\)/gi, "$1s")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `DERIV:${core}`;
}

function normalizedLookupKey(value) {
  return String(value || "")
    .trim()
    .replace(/^deriv:/i, "DERIV:")
    .toUpperCase()
    .replace(/[^A-Z0-9:]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defineSymbol({ symbol, derivSymbol, displayName, submarket, tradingViewSymbol, executionSupported = false }) {
  const tvSymbol = tradingViewSymbol || tradingViewSymbolFromDisplayName(displayName);
  return Object.freeze({
    symbol,
    derivSymbol,
    displayName,
    market: "synthetic_index",
    submarket,
    tradingViewSymbol: tvSymbol,
    tradingViewSearchTerm: displayName,
    executionSupported,
  });
}

export const DERIV_RESEARCH_SYMBOLS = Object.freeze([
  defineSymbol({ symbol: "AUD_BASKET", derivSymbol: "WLDAUD", displayName: "AUD Basket", submarket: "forex_basket" }),
  defineSymbol({ symbol: "BEAR_MARKET", derivSymbol: "RDBEAR", displayName: "Bear Market Index", submarket: "random_daily" }),
  defineSymbol({ symbol: "BOOM_50", derivSymbol: "BOOM50", displayName: "Boom 50 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BOOM_150", derivSymbol: "BOOM150N", displayName: "Boom 150 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BOOM_300", derivSymbol: "BOOM300N", displayName: "Boom 300 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BOOM_500", derivSymbol: "BOOM500", displayName: "Boom 500 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BOOM_600", derivSymbol: "BOOM600", displayName: "Boom 600 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BOOM_900", derivSymbol: "BOOM900", displayName: "Boom 900 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BOOM_1000", derivSymbol: "BOOM1000", displayName: "Boom 1000 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "BULL_MARKET", derivSymbol: "RDBULL", displayName: "Bull Market Index", submarket: "random_daily" }),
  defineSymbol({ symbol: "CRASH_50", derivSymbol: "CRASH50", displayName: "Crash 50 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "CRASH_150", derivSymbol: "CRASH150N", displayName: "Crash 150 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "CRASH_300", derivSymbol: "CRASH300N", displayName: "Crash 300 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "CRASH_500", derivSymbol: "CRASH500", displayName: "Crash 500 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "CRASH_600", derivSymbol: "CRASH600", displayName: "Crash 600 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "CRASH_900", derivSymbol: "CRASH900", displayName: "Crash 900 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "CRASH_1000", derivSymbol: "CRASH1000", displayName: "Crash 1000 Index", submarket: "crash_index" }),
  defineSymbol({ symbol: "EUR_BASKET", derivSymbol: "WLDEUR", displayName: "EUR Basket", submarket: "forex_basket" }),
  defineSymbol({ symbol: "GBP_BASKET", derivSymbol: "WLDGBP", displayName: "GBP Basket", submarket: "forex_basket" }),
  defineSymbol({ symbol: "GOLD_BASKET", derivSymbol: "WLDXAU", displayName: "Gold Basket", submarket: "commodity_basket" }),
  defineSymbol({ symbol: "JUMP_10", derivSymbol: "JD10", displayName: "Jump 10 Index", submarket: "jump_index" }),
  defineSymbol({ symbol: "JUMP_25", derivSymbol: "JD25", displayName: "Jump 25 Index", submarket: "jump_index" }),
  defineSymbol({ symbol: "JUMP_50", derivSymbol: "JD50", displayName: "Jump 50 Index", submarket: "jump_index" }),
  defineSymbol({ symbol: "JUMP_75", derivSymbol: "JD75", displayName: "Jump 75 Index", submarket: "jump_index" }),
  defineSymbol({ symbol: "JUMP_100", derivSymbol: "JD100", displayName: "Jump 100 Index", submarket: "jump_index" }),
  defineSymbol({ symbol: "RANGE_BREAK_100", derivSymbol: "RB100", displayName: "Range Break 100 Index", submarket: "range_index" }),
  defineSymbol({ symbol: "RANGE_BREAK_200", derivSymbol: "RB200", displayName: "Range Break 200 Index", submarket: "range_index" }),
  defineSymbol({ symbol: "STEP_100", derivSymbol: "stpRNG", displayName: "Step Index 100", submarket: "step_index" }),
  defineSymbol({ symbol: "STEP_200", derivSymbol: "stpRNG2", displayName: "Step Index 200", submarket: "step_index" }),
  defineSymbol({ symbol: "STEP_300", derivSymbol: "stpRNG3", displayName: "Step Index 300", submarket: "step_index" }),
  defineSymbol({ symbol: "STEP_400", derivSymbol: "stpRNG4", displayName: "Step Index 400", submarket: "step_index" }),
  defineSymbol({ symbol: "STEP_500", derivSymbol: "stpRNG5", displayName: "Step Index 500", submarket: "step_index" }),
  defineSymbol({ symbol: "USD_BASKET", derivSymbol: "WLDUSD", displayName: "USD Basket", submarket: "forex_basket" }),
  defineSymbol({ symbol: "VOLATILITY_10_1S", derivSymbol: "1HZ10V", displayName: "Volatility 10 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_10", derivSymbol: "R_10", displayName: "Volatility 10 Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_15_1S", derivSymbol: "1HZ15V", displayName: "Volatility 15 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_25_1S", derivSymbol: "1HZ25V", displayName: "Volatility 25 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_25", derivSymbol: "R_25", displayName: "Volatility 25 Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_30_1S", derivSymbol: "1HZ30V", displayName: "Volatility 30 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_50_1S", derivSymbol: "1HZ50V", displayName: "Volatility 50 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_50", derivSymbol: "R_50", displayName: "Volatility 50 Index", submarket: "random_index", executionSupported: true }),
  defineSymbol({ symbol: "VOLATILITY_75_1S", derivSymbol: "1HZ75V", displayName: "Volatility 75 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_75", derivSymbol: "R_75", displayName: "Volatility 75 Index", submarket: "random_index", executionSupported: true }),
  defineSymbol({ symbol: "VOLATILITY_90_1S", derivSymbol: "1HZ90V", displayName: "Volatility 90 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_100_1S", derivSymbol: "1HZ100V", displayName: "Volatility 100 (1s) Index", submarket: "random_index" }),
  defineSymbol({ symbol: "VOLATILITY_100", derivSymbol: "R_100", displayName: "Volatility 100 Index", submarket: "random_index" }),
]);

const LOOKUP = new Map();

for (const item of DERIV_RESEARCH_SYMBOLS) {
  const aliases = [
    item.symbol,
    item.derivSymbol,
    item.displayName,
    item.tradingViewSymbol,
    item.tradingViewSymbol.replace(/^DERIV:/, "Deriv:"),
  ];
  for (const alias of aliases) LOOKUP.set(normalizedLookupKey(alias), item);
}

export function getResearchSymbolCatalog() {
  return DERIV_RESEARCH_SYMBOLS.map(item => ({ ...item }));
}

export function resolveResearchSymbol(symbol) {
  const item = LOOKUP.get(normalizedLookupKey(symbol));
  if (!item) {
    throw new Error(`Unsupported Deriv research symbol "${symbol}". Run deriv_active_symbols to inspect the current catalogue.`);
  }
  return { ...item };
}

export function normalizeDerivResearchSymbol(symbol) {
  return resolveResearchSymbol(symbol).derivSymbol;
}

export function toTradingViewSymbol(symbol) {
  return resolveResearchSymbol(symbol).tradingViewSymbol;
}

function symbolFromDisplayName(displayName, derivSymbol) {
  const match = DERIV_RESEARCH_SYMBOLS.find(item => item.derivSymbol === derivSymbol);
  if (match) return match.symbol;
  return String(displayName || derivSymbol)
    .replace(/\((\d+)s\)/gi, "$1s")
    .replace(/\bIndex\b/gi, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function formatDerivActiveSymbol(raw) {
  const derivSymbol = raw.symbol || raw.underlying_symbol;
  const displayName = raw.display_name || raw.underlying_symbol_name || derivSymbol;
  const known = DERIV_RESEARCH_SYMBOLS.find(item => item.derivSymbol === derivSymbol);
  if (known) return { ...known };
  return {
    symbol: symbolFromDisplayName(displayName, derivSymbol),
    derivSymbol,
    displayName,
    market: raw.market,
    submarket: raw.submarket,
    tradingViewSymbol: tradingViewSymbolFromDisplayName(displayName),
    tradingViewSearchTerm: displayName,
    executionSupported: false,
  };
}

export function formatDerivActiveSymbols(rawSymbols = []) {
  return rawSymbols
    .filter(item => (item.market || "") === "synthetic_index")
    .map(formatDerivActiveSymbol);
}
