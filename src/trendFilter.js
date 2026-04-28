// EMA + RSI directional filter. Returns pass + per-check details.
export function evaluateTrendFilter(price, ema, rsi, side, rules) {
  if (!rules.ema_required) return { pass: true, checks: [] };
  if (side === "long") {
    const c1 = { label: "price > EMA",         pass: price > ema,                actual: price, required: ema };
    const c2 = { label: "RSI > entry threshold", pass: rsi > rules.rsi_long_min_entry, actual: rsi,   required: rules.rsi_long_min_entry };
    return { pass: c1.pass && c2.pass, checks: [c1, c2] };
  }
  const c1 = { label: "price < EMA",            pass: price < ema,                actual: price, required: ema };
  const c2 = { label: "RSI < entry threshold",  pass: rsi < rules.rsi_short_max_entry, actual: rsi,   required: rules.rsi_short_max_entry };
  return { pass: c1.pass && c2.pass, checks: [c1, c2] };
}
