// Returns a list of breakouts on the given candle. One breakout per direction max.
// Uses CLOSE > level + N*ATR (long) / < level - N*ATR (short), gated by range expansion + RSI.
export function detectBreakouts(candle, activeLevels, atr, rsi, rangeAvg, rules, previousBars = []) {
  const breaks = [];
  const range = candle.high - candle.low;
  const rangeOk = range >= rules.min_range_multiplier * rangeAvg;
  if (!rangeOk) return breaks;

  for (const r of activeLevels.resistances) {
    const driftedAbove = previousBars.length >= 3 && previousBars.slice(-3).every(b => b.close > r.price);
    if (
      !driftedAbove &&
      candle.close > r.price + rules.min_close_distance_atr * atr &&
      rsi > rules.rsi_long_min
    ) {
      breaks.push({
        side: "long",
        level: r.price,
        levelKey: r.key,
        atrAtBreak: atr,
        breakEpoch: candle.epoch,
      });
    }
  }
  for (const s of activeLevels.supports) {
    const driftedBelow = previousBars.length >= 3 && previousBars.slice(-3).every(b => b.close < s.price);
    if (
      !driftedBelow &&
      candle.close < s.price - rules.min_close_distance_atr * atr &&
      rsi < rules.rsi_short_max
    ) {
      breaks.push({
        side: "short",
        level: s.price,
        levelKey: s.key,
        atrAtBreak: atr,
        breakEpoch: candle.epoch,
      });
    }
  }
  return breaks;
}
