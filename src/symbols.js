const SYNTHETIC_SYMBOL_MAP = {
  VOLATILITY_75: "R_75",
  VOLATILITY_50: "R_50",
  R_75: "R_75",
  R_50: "R_50",
};

export const SUPPORTED_SYNTHETIC_SYMBOLS = Object.freeze(Object.keys(SYNTHETIC_SYMBOL_MAP));

export function normalizeSyntheticSymbol(symbol) {
  const normalized = SYNTHETIC_SYMBOL_MAP[symbol];
  if (!normalized) {
    throw new Error(`Unsupported symbol "${symbol}". Supported symbols: VOLATILITY_75, VOLATILITY_50, R_75, R_50.`);
  }
  return normalized;
}
