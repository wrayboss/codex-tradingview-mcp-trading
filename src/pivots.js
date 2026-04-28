import { pivotHighAt, pivotLowAt } from "./indicators.js";

// Scan candles, return all confirmed pivots with the epoch of the pivot bar AND
// the epoch at which the pivot was confirmed (= pivot bar epoch + right * granularity)
export function findPivots(candles, left, right) {
  const highs = candles.map(c => c.high);
  const lows  = candles.map(c => c.low);
  const out = { highs: [], lows: [] };
  for (let idx = left + right; idx < candles.length; idx++) {
    const ph = pivotHighAt(highs, idx, left, right);
    if (ph != null) {
      out.highs.push({
        epoch: candles[idx - right].epoch,
        confirmedAt: candles[idx].epoch,
        price: ph,
      });
    }
    const pl = pivotLowAt(lows, idx, left, right);
    if (pl != null) {
      out.lows.push({
        epoch: candles[idx - right].epoch,
        confirmedAt: candles[idx].epoch,
        price: pl,
      });
    }
  }
  return out;
}
