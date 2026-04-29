import { normalizeSyntheticSymbol } from "./symbols.js";

export const DERIV_MULTIPLIER_CONSTRAINTS = Object.freeze({
  R_75: Object.freeze({
    minStakeUsd: 1,
    defaultMultiplier: 50,
    allowedMultipliers: Object.freeze([50, 100, 200, 300, 500]),
  }),
  R_50: Object.freeze({
    minStakeUsd: 1,
    defaultMultiplier: 80,
    allowedMultipliers: Object.freeze([80, 200, 400, 600, 800]),
  }),
});

export function getDerivTradeConstraints(symbol) {
  const derivSymbol = normalizeSyntheticSymbol(symbol);
  return DERIV_MULTIPLIER_CONSTRAINTS[derivSymbol];
}

export function resolveMultiplierForSymbol(symbol, requestedMultiplier, rules = {}) {
  const constraints = getDerivTradeConstraints(symbol);
  if (requestedMultiplier != null && requestedMultiplier !== "") {
    return Number.parseInt(requestedMultiplier, 10);
  }

  const configured = rules.execution?.multiplier_by_symbol?.[symbol]
    ?? rules.execution?.multiplier_by_symbol?.[normalizeSyntheticSymbol(symbol)];
  if (configured != null) return Number.parseInt(configured, 10);

  return constraints.defaultMultiplier;
}

export function validateDerivTradeSize({ symbol, stakeUsd, multiplier }) {
  const constraints = getDerivTradeConstraints(symbol);
  if (!Number.isFinite(stakeUsd) || stakeUsd < constraints.minStakeUsd) {
    return {
      ok: false,
      message: `STAKE_USD for ${symbol} must be at least ${constraints.minStakeUsd.toFixed(2)}; Deriv rejects smaller multiplier stakes.`,
    };
  }

  if (!Number.isInteger(multiplier) || !constraints.allowedMultipliers.includes(multiplier)) {
    return {
      ok: false,
      message: `MULTIPLIER for ${symbol} must be one of ${constraints.allowedMultipliers.join(", ")}.`,
    };
  }

  return { ok: true };
}

export function describeDerivTradeConstraints(symbol) {
  const constraints = getDerivTradeConstraints(symbol);
  return `$${constraints.minStakeUsd.toFixed(2)} min stake, multipliers ${constraints.allowedMultipliers.join("/")}`;
}
