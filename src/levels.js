// Active S/R level store. Tracks resistance + support pivots with broken/traded state.
export class LevelStore {
  constructor({ traded, maxActive = Infinity, ttlSeconds = Infinity } = {}) {
    this.resistances = [];
    this.supports = [];
    this.broken = new Set();          // ephemeral: broken within the current run
    this.traded = traded || new Set(); // persistent: levels that produced a trade; never re-arm
    this.maxActive = maxActive;
    this.ttlSeconds = ttlSeconds;
  }

  ingest(pivots) {
    for (const p of pivots.highs) {
      this.resistances.push({ ...p, key: `R:${p.epoch}:${p.price}` });
    }
    for (const p of pivots.lows) {
      this.supports.push({ ...p, key: `S:${p.epoch}:${p.price}` });
    }
  }

  activeAt(epoch) {
    const filt = (p) =>
      p.confirmedAt <= epoch &&
      epoch - p.confirmedAt <= this.ttlSeconds &&
      !this.broken.has(p.key) &&
      !this.traded.has(p.key);
    const newest = (levels) =>
      levels.filter(filt).sort((a, b) => b.confirmedAt - a.confirmedAt).slice(0, this.maxActive);
    return {
      resistances: newest(this.resistances),
      supports: newest(this.supports),
    };
  }

  markBroken(key) { this.broken.add(key); }
  markTraded(key) { this.traded.add(key); }
}
