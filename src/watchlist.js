import { normalizeSyntheticSymbol } from "./symbols.js";
import { resolveMultiplierForSymbol, validateDerivTradeSize } from "./tradeConstraints.js";

export const OPERATOR_WATCHLIST = Object.freeze([
  Object.freeze({
    symbol: "VOLATILITY_75",
    derivSymbol: "R_75",
    tradingViewSymbol: "DERIV:VOLATILITY_75_INDEX",
    label: "Volatility 75 Index",
  }),
  Object.freeze({
    symbol: "VOLATILITY_50",
    derivSymbol: "R_50",
    tradingViewSymbol: "DERIV:VOLATILITY_50_INDEX",
    label: "Volatility 50 Index",
  }),
]);

const WATCHLIST_BY_SYMBOL = new Map(
  OPERATOR_WATCHLIST.flatMap(item => [
    [item.symbol, item],
    [item.derivSymbol, item],
  ]),
);

export function getOperatorWatchlist() {
  return OPERATOR_WATCHLIST.map(item => ({ ...item }));
}

export function resolveOperatorSymbol(symbol) {
  const item = WATCHLIST_BY_SYMBOL.get(symbol);
  if (!item) {
    throw new Error(`Unsupported operator watchlist symbol "${symbol}". Supported symbols: VOLATILITY_75 and VOLATILITY_50.`);
  }
  return { ...item };
}

export function resolveActiveWatchlist({ rules, envSymbol, stakeUsd, requestedMultiplier }) {
  if (!Array.isArray(rules?.symbols) || rules.symbols.length === 0) {
    throw new Error("rules.symbols must list the Deriv operator watchlist.");
  }

  const configuredSymbols = rules.symbols.map(symbol => resolveOperatorSymbol(symbol).symbol);
  const activeSymbols = envSymbol
    ? [envSymbol]
    : configuredSymbols;

  for (const symbol of activeSymbols) {
    if (!configuredSymbols.includes(symbol)) {
      throw new Error(`SYMBOL=${envSymbol} not in rules.symbols (${configuredSymbols.join(", ")}). Refusing to start.`);
    }
  }

  const entries = activeSymbols.map(symbol => {
    const watchlist = resolveOperatorSymbol(symbol);
    const derivSymbol = normalizeSyntheticSymbol(symbol);
    const multiplier = resolveMultiplierForSymbol(symbol, requestedMultiplier, rules);
    const validation = validateDerivTradeSize({ symbol, stakeUsd, multiplier });
    if (!validation.ok) throw new Error(validation.message);
    return { ...watchlist, derivSymbol, multiplier };
  });

  return {
    symbols: entries.map(entry => entry.symbol),
    entries,
    multipliersBySymbol: Object.fromEntries(entries.map(entry => [entry.symbol, entry.multiplier])),
  };
}
