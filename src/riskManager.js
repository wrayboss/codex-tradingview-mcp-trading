import { readFileSync, existsSync, writeFileSync } from "fs";
import {
  SAFETY_LOG_FILE,
  SAFETY_LOG_SCHEMA_VERSION,
  archiveFile,
  emptySafetyLog,
  isCurrentSafetyLog,
} from "./artifacts.js";

const LOG_ROTATE_MAX = 1000;
const LOG_ROTATE_KEEP = 500;

export class RiskManager {
  constructor(rules, { logFile = SAFETY_LOG_FILE } = {}) {
    this.rules = rules;
    this.logFile = logFile;
    this.history = emptySafetyLog();
  }

  load() {
    if (existsSync(this.logFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.logFile, "utf8"));
        if (isCurrentSafetyLog(parsed)) {
          this.history = parsed;
        } else {
          archiveFile(this.logFile, "legacy");
          this.history = emptySafetyLog();
          this.save();
        }
      } catch {
        archiveFile(this.logFile, "legacy");
        this.history = emptySafetyLog();
        this.save();
      }
    }
    if (!Array.isArray(this.history.trades)) this.history.trades = [];
    this.history.schemaVersion = SAFETY_LOG_SCHEMA_VERSION;
  }

  todayCount() {
    const today = new Date().toISOString().slice(0, 10);
    return this.history.trades.filter(t => t.timestamp?.startsWith(today) && t.orderPlaced).length;
  }

  canTrade(candleEpoch) {
    if (this.todayCount() >= this.rules.max_trades_per_day) {
      return { allowed: false, reason: `daily cap (${this.todayCount()}/${this.rules.max_trades_per_day})` };
    }
    const last = [...this.history.trades].reverse().find(t => t.orderPlaced);
    if (last && last.outcome === "loss" && this.rules.cooldown_bars_after_loss > 0) {
      const elapsedBars = Math.floor((candleEpoch - (last.epoch || 0)) / 900);
      if (elapsedBars < this.rules.cooldown_bars_after_loss) {
        return { allowed: false, reason: `cooldown after loss (${elapsedBars}/${this.rules.cooldown_bars_after_loss} bars)` };
      }
    }
    return { allowed: true };
  }

  computeSL(price, atr, side) {
    const dist = this.rules.atr_sl_multiplier * atr;
    return side === "long" ? price - dist : price + dist;
  }

  computeTP(price, atr, side) {
    const dist = this.rules.atr_sl_multiplier * atr * this.rules.min_rr;
    return side === "long" ? price + dist : price - dist;
  }

  // Deriv multiplier P&L = stake * multiplier * (price_change / entry_price)
  // SL at price-distance D: usd_loss = stake * multiplier * (D / entry_price).
  // Cap at rules.stop_loss_usd; never let SL exceed configured cap.
  computeSlUsd(slPrice, entryPrice, stakeUsd, multiplier) {
    const pct = Math.abs(slPrice - entryPrice) / entryPrice;
    const atrSl = stakeUsd * multiplier * pct;
    return Math.min(atrSl, this.rules.stop_loss_usd);
  }

  computeTpUsd(tpPrice, entryPrice, stakeUsd, multiplier) {
    const pct = Math.abs(tpPrice - entryPrice) / entryPrice;
    return stakeUsd * multiplier * pct;
  }

  save() {
    this.history.schemaVersion = SAFETY_LOG_SCHEMA_VERSION;
    writeFileSync(this.logFile, JSON.stringify(this.history, null, 2));
  }

  recordDecision(entry) {
    this.history.trades.push(entry);
    if (this.history.trades.length > LOG_ROTATE_MAX) {
      const archive = this.history.trades.slice(0, LOG_ROTATE_KEEP);
      this.history.trades = this.history.trades.slice(LOG_ROTATE_KEEP);
      const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
      const archiveFilePath = this.logFile.replace(/\.json$/i, `.archive-${ts}.json`);
      writeFileSync(archiveFilePath, JSON.stringify({
        schemaVersion: SAFETY_LOG_SCHEMA_VERSION,
        trades: archive,
      }, null, 2));
    }
    this.save();
  }
}
