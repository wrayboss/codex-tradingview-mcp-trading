// Candle pattern classifier: strong-body close, pin bar, or engulfing.
// Returns pass flag for both long and short on this bar.
export function evaluateConfirmation(candle, prev, rules) {
  const body      = Math.abs(candle.close - candle.open);
  const range     = candle.high - candle.low;
  const upperWick = candle.high - Math.max(candle.close, candle.open);
  const lowerWick = Math.min(candle.close, candle.open) - candle.low;
  const isBull    = candle.close > candle.open;
  const isBear    = candle.close < candle.open;
  const bodyOk    = range > 0 && body / range >= rules.min_body_pct;

  const upperThird = candle.high - range / 3;
  const lowerThird = candle.low + range / 3;
  const bullPin = rules.allow_pin_bar && body > 0 && lowerWick >= 2 * body && candle.close >= upperThird;
  const bearPin = rules.allow_pin_bar && body > 0 && upperWick >= 2 * body && candle.close <= lowerThird;

  const prevBull = prev.close > prev.open;
  const prevBear = prev.close < prev.open;
  const bullEng = rules.allow_engulfing && isBull && prevBear && candle.close >= prev.open && candle.open <= prev.close;
  const bearEng = rules.allow_engulfing && isBear && prevBull && candle.close <= prev.open && candle.open >= prev.close;

  return {
    pass: {
      long:  (isBull && bodyOk) || bullPin || bullEng,
      short: (isBear && bodyOk) || bearPin || bearEng,
    },
    reasons: { bodyOk, bullPin, bearPin, bullEng, bearEng, isBull, isBear },
  };
}
