/**
 * Drop the last candle from an array if it is still in progress
 * (its epoch + granularity seconds > now).
 */
export function filterInProgress(candles, granularitySeconds) {
  if (!candles.length) return candles;
  const nowSec = Math.floor(Date.now() / 1000);
  if (candles.at(-1).epoch + granularitySeconds > nowSec) {
    return candles.slice(0, -1);
  }
  return candles;
}
