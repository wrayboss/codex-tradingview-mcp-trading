// Per-level state machine: AWAITING -> IN_ZONE (event) | INVALIDATED (dropped).
// advance(candle) is called once per bar. Existing trackers age by 1 bar; new ones (added
// via start() AFTER advance() returns) wait until next bar before they can age in.
export class RetestTracker {
  constructor(rules) {
    this.tracking = [];
    this.rules = rules;
  }

  start(breakout) {
    this.tracking.push({
      side: breakout.side,
      level: breakout.level,
      levelKey: breakout.levelKey,
      atrAtBreak: breakout.atrAtBreak,
      breakEpoch: breakout.breakEpoch,
      barsSince: 0,
      retestTouched: false,
      confirmBars: 0,
    });
  }

  advance(candle, atr) {
    const events = [];
    const tolBuf = this.rules.tolerance_atr * atr;
    const invBuf = this.rules.invalidation_atr * atr;

    this.tracking = this.tracking.filter(t => {
      t.barsSince++;
      if (t.barsSince > this.rules.max_bars_after_break) return false;
      const maxConfirmBars = this.rules.max_bars_to_confirm ?? 1;

      if (t.side === "long") {
        if (candle.close < t.level - invBuf) return false;
        if (t.retestTouched) {
          t.confirmBars++;
          events.push({ side: "long", level: t.level, levelKey: t.levelKey, candle, tracker: t, phase: "confirm" });
          return t.confirmBars < maxConfirmBars;
        }
        if (candle.low <= t.level + tolBuf) {
          t.retestTouched = true;
          t.confirmBars = 1;
          events.push({ side: "long", level: t.level, levelKey: t.levelKey, candle, tracker: t, phase: "retest" });
          return t.confirmBars < maxConfirmBars;
        }
      } else {
        if (candle.close > t.level + invBuf) return false;
        if (t.retestTouched) {
          t.confirmBars++;
          events.push({ side: "short", level: t.level, levelKey: t.levelKey, candle, tracker: t, phase: "confirm" });
          return t.confirmBars < maxConfirmBars;
        }
        if (candle.high >= t.level - tolBuf) {
          t.retestTouched = true;
          t.confirmBars = 1;
          events.push({ side: "short", level: t.level, levelKey: t.levelKey, candle, tracker: t, phase: "retest" });
          return t.confirmBars < maxConfirmBars;
        }
      }
      return true;
    });

    return events;
  }

  // Drop tracker (e.g. after firing a trade)
  consume(t) {
    this.tracking = this.tracking.filter(x => x !== t);
  }
}
