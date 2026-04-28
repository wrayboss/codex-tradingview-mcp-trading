// Pure indicator math. Series functions return null-padded arrays of same length as input.
// EMA, RSI (Wilder), ATR (Wilder), SMA, pivothigh/low all match TradingView semantics.

export function smaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

export function sma(values, period) {
  const s = smaSeries(values, period);
  return s[s.length - 1];
}

export function emaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += values[i];
  ema /= period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function ema(values, period) {
  const s = emaSeries(values, period);
  return s[s.length - 1];
}

// Wilder's RSI matches TradingView ta.rsi.
export function rsiSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function rsi(closes, period) {
  const s = rsiSeries(closes, period);
  return s[s.length - 1];
}

// Wilder's ATR matches TradingView ta.atr.
export function atrSeries(candles, period) {
  const out = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const trs = new Array(candles.length);
  trs[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    );
  }
  let atrVal = 0;
  for (let i = 0; i < period; i++) atrVal += trs[i];
  atrVal /= period;
  out[period - 1] = atrVal;
  for (let i = period; i < candles.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    out[i] = atrVal;
  }
  return out;
}

export function atr(candles, period) {
  const s = atrSeries(candles, period);
  return s[s.length - 1];
}

// Pine ta.pivothigh(left, right): pivot bar at index `pivotIdx`, confirmed `right` bars later.
// Returns the pivot value if bar (currentIdx - right) is a pivot high; null otherwise.
export function pivotHighAt(highs, currentIdx, left, right) {
  const pivotIdx = currentIdx - right;
  if (pivotIdx - left < 0 || pivotIdx >= highs.length) return null;
  const v = highs[pivotIdx];
  for (let i = pivotIdx - left; i <= pivotIdx + right; i++) {
    if (i === pivotIdx) continue;
    if (i < 0 || i >= highs.length) return null;
    if (highs[i] >= v) return null;
  }
  return v;
}

export function pivotLowAt(lows, currentIdx, left, right) {
  const pivotIdx = currentIdx - right;
  if (pivotIdx - left < 0 || pivotIdx >= lows.length) return null;
  const v = lows[pivotIdx];
  for (let i = pivotIdx - left; i <= pivotIdx + right; i++) {
    if (i === pivotIdx) continue;
    if (i < 0 || i >= lows.length) return null;
    if (lows[i] <= v) return null;
  }
  return v;
}
