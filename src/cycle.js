/**
 * Core strategy cycle — injectable for testing.
 *
 * runCycle(config, rules, risk, opts) executes one full evaluation:
 *   connect → reconcile → gate checks → fetch candles → strategy pipeline → maybe order → disconnect
 *
 * Returns the decision object, or undefined if the cycle exited early (gate/guard).
 *
 * opts:
 *   dryRun           {boolean}  skip order placement  (default false)
 *   monitorSettlement{boolean}  stay alive until contract settles (default true)
 *   stateDir         {string}   override state directory path (default "state")
 *   clientFactory    {fn}       ({ apiToken, appId }) => DerivClient-like (default new DerivClient)
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync, renameSync } from "fs";
import { appendSettlementCsvRow, applySettlement, archiveFile } from "./artifacts.js";
import { DerivClient }          from "./derivClient.js";
import { findPivots }           from "./pivots.js";
import { LevelStore }           from "./levels.js";
import { detectBreakouts }      from "./breakoutDetector.js";
import { RetestTracker }        from "./retestTracker.js";
import { evaluateConfirmation } from "./confirmation.js";
import { evaluateTrendFilter }  from "./trendFilter.js";
import { emaSeries, rsiSeries, atrSeries, smaSeries } from "./indicators.js";
import { filterInProgress }     from "./candleUtils.js";
import { monitorContract }      from "./contractMonitor.js";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Reconcile ─────────────────────────────────────────────────────────────────
export async function reconcileUnsettled(risk, client, opts = {}) {
  const unsettled = risk.history.trades.filter(t => t.orderPlaced && !t.outcome && t.contractId);
  if (!unsettled.length) return;
  console.log(`[reconcile] Checking ${unsettled.length} unsettled contract(s)...`);
  let updated = 0;
  for (const trade of unsettled) {
    try {
      const r = await client.contractStatus(trade.contractId);
      const c = r?.proposal_open_contract;
      if (c?.is_sold) {
        applySettlement(trade, c);
        if (opts.settlementCsvFile) {
          appendSettlementCsvRow(trade, { filePath: opts.settlementCsvFile, settledAt: opts.nowFn?.() ?? new Date() });
        }
        updated++;
      }
    } catch { /* still open or network error — retry next cycle */ }
  }
  if (updated) {
    risk.save();
    console.log(`[reconcile] Updated ${updated} contract outcome(s).`);
  }
}

// ─── Order placement with retry ────────────────────────────────────────────────
export async function placeOrderWithRetry(client, proposalParams, stakeUsd, maxAttempts = 3) {
  const delays = [1000, 5000, 10000];
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const proposal = await client.proposal(proposalParams);
      const order    = await client.buy(proposal.proposal.id, stakeUsd);
      return { proposal, order };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        const wait = delays[attempt];
        console.log(`  [retry] ${err.message} — attempt ${attempt + 1}/${maxAttempts}, retrying in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

// ─── Main cycle ────────────────────────────────────────────────────────────────
export async function runCycle(config, rules, risk, opts = {}) {
  const {
    dryRun            = false,
    monitorSettlement = true,
    stateDir          = "state",
    clientFactory     = ({ apiToken, appId }) => new DerivClient({ apiToken, appId }),
    nowFn             = () => new Date(),
    settlementCsvFile = null,
    monitorOptions    = {},
  } = opts;

  const { symbol, derivSymbol, stakeUsd, multiplier, apiToken, appId } = config;

  const client = clientFactory({ apiToken, appId });
  await client.connect();
  console.log("\n[deriv] Connected");

  const account = await client.authorize();
  console.log(`[deriv] ${account.email} - ${account.is_virtual ? "DEMO" : "LIVE"} | ${account.currency} ${account.balance}`);

  await reconcileUnsettled(risk, client, { settlementCsvFile, nowFn });

  // Session gate
  const session = rules.session ?? { utc_start_hour: 0, utc_end_hour: 24 };
  if (!inSession(session, nowFn)) {
    const hour = nowFn().getUTCHours();
    console.log(`[gate] Outside trading session (UTC ${hour}h, window ${session.utc_start_hour}-${session.utc_end_hour}) — skipping.`);
    client.close();
    return undefined;
  }

  // Backtest gate (live only)
  if (!dryRun) {
    const backtestFile = `${stateDir}/backtest-approved.json`;
    let btApproved = false;
    if (existsSync(backtestFile)) {
      try { btApproved = JSON.parse(readFileSync(backtestFile, "utf8"))?.approved === true; } catch {}
    }
    if (!btApproved) {
      console.log("[gate] Backtest not approved. Run: npm run validate-backtest <tv-export.csv>");
      client.close();
      return undefined;
    }
  }

  // Open position check (live only)
  if (!dryRun) {
    const open = await client.openPositions();
    if (open.length) {
      console.log(`[deriv] ${open.length} open position(s) — skipping new entry.`);
      open.forEach(c => console.log(`         ${c.contract_id} ${c.contract_type} ${c.symbol}`));
      client.close();
      return undefined;
    }
  }

  const htfGran = parseInt(rules.timeframes.structure, 10) * 60;
  const ltfGran = parseInt(rules.timeframes.entry, 10)     * 60;

  console.log(`\n[data] Fetching HTF (${rules.timeframes.structure}m) and LTF (${rules.timeframes.entry}m)...`);
  const [htfRaw, ltfRaw] = await Promise.all([
    client.candles({ symbol: derivSymbol, granularity: htfGran, count: 300 }),
    client.candles({ symbol: derivSymbol, granularity: ltfGran, count: 500 }),
  ]);
  const htfCandles = filterInProgress(htfRaw, htfGran);
  const ltfCandles = filterInProgress(ltfRaw, ltfGran);
  console.log(`[data] HTF ${htfCandles.length} bars | LTF ${ltfCandles.length} bars`);

  // EMA warmup guard — must have enough bars for all indicators
  if (ltfCandles.length < 51) {
    console.log(`[warn] Not enough LTF bars (${ltfCandles.length}, need >50) — skipping cycle.`);
    client.close();
    return undefined;
  }

  // HTF pivots → levels
  const pivots = findPivots(htfCandles, rules.structure.pivot_left, rules.structure.pivot_right);
  console.log(`[struct] Pivots - ${pivots.highs.length}R / ${pivots.lows.length}S`);

  const tradedFile = `${stateDir}/traded-levels-${derivSymbol}.json`;
  migrateTradedLevels(stateDir, tradedFile);
  const tradedLevels = loadTradedLevels(tradedFile);
  const levels = new LevelStore({
    traded:     tradedLevels,
    maxActive:  rules.structure.max_active_levels,
    ttlSeconds: rules.structure.level_ttl_bars_htf * htfGran,
  });
  levels.ingest(pivots);

  // LTF indicators
  const closes = ltfCandles.map(c => c.close);
  const ranges = ltfCandles.map(c => c.high - c.low);
  const emaArr = emaSeries(closes, rules.indicators.ema.period);
  const rsiArr = rsiSeries(closes, rules.indicators.rsi.period);
  const atrArr = atrSeries(ltfCandles, rules.indicators.atr.period);
  const rngArr = smaSeries(ranges, rules.indicators.range_sma.period);

  const tracker = new RetestTracker({
    ...rules.retest,
    max_bars_to_confirm: rules.confirmation.max_bars_to_confirm,
  });

  const lastIdx = ltfCandles.length - 1;
  let signalToFire = null;

  for (let i = 50; i <= lastIdx; i++) {
    const candle = ltfCandles[i];
    const prev   = ltfCandles[i - 1];
    const ema = emaArr[i], rsi = rsiArr[i], atr = atrArr[i], rngAvg = rngArr[i];
    if (ema == null || rsi == null || atr == null || rngAvg == null) continue;

    const events = tracker.advance(candle, atr);

    const active = levels.activeAt(candle.epoch);
    const breaks = detectBreakouts(
      candle, active, atr, rsi, rngAvg, rules.breakout,
      ltfCandles.slice(Math.max(0, i - 3), i)
    );
    breaks.forEach(b => {
      tracker.start(b);
      levels.markBroken(b.levelKey);
    });

    if (i !== lastIdx) continue;

    for (const e of events) {
      const conf   = evaluateConfirmation(candle, prev, rules.confirmation);
      const trend  = evaluateTrendFilter(candle.close, ema, rsi, e.side, rules.trend_filter);
      const confOk = conf.pass[e.side];

      console.log(`\n[signal] retest event: ${e.side.toUpperCase()} of ${e.level.toFixed(4)}`);
      console.log(`[signal]   confirmation: ${confOk ? "PASS" : "FAIL"}`);
      console.log(`[signal]   trend filter: ${trend.pass ? "PASS" : "FAIL"}`);

      if (!confOk || !trend.pass) continue;

      const gate = risk.canTrade(candle.epoch);
      if (!gate.allowed) {
        console.log(`[signal]   BLOCKED risk gate: ${gate.reason}`);
        continue;
      }

      signalToFire = { event: e, atr, ema, rsi };
      break;
    }
  }

  const lastCandle = ltfCandles[lastIdx];
  const decision = {
    timestamp: new Date().toISOString(),
    epoch:     lastCandle.epoch,
    symbol,
    derivSymbol,
    price:     lastCandle.close,
    indicators: {
      ema:       emaArr[lastIdx],
      rsi:       rsiArr[lastIdx],
      atr:       atrArr[lastIdx],
      range_avg: rngArr[lastIdx],
    },
    activeLevels: {
      resistances: levels.activeAt(lastCandle.epoch).resistances.length,
      supports:    levels.activeAt(lastCandle.epoch).supports.length,
    },
    trackedRetests: tracker.tracking.length,
    side:        null,
    stakeUsd,
    multiplier,
    slUsd:       null,
    tpUsd:       null,
    slPrice:     null,
    tpPrice:     null,
    contractId:  null,
    orderPlaced: false,
    outcome:     null,
    pnl_usd:     null,
    mode:        dryRun ? "DRY_RUN" : (signalToFire ? "LIVE" : "NO_SIGNAL"),
    notes:       "",
  };

  console.log("\n-- Decision -----------------------------------------");

  if (!signalToFire) {
    console.log(`  No signal. Active R/S: ${decision.activeLevels.resistances}/${decision.activeLevels.supports}`);
  } else {
    const { event, atr } = signalToFire;
    const side         = event.side;
    const contractType = side === "long" ? "MULTUP" : "MULTDOWN";
    const slPrice = risk.computeSL(lastCandle.close, atr, side);
    const tpPrice = risk.computeTP(lastCandle.close, atr, side);
    const slUsd   = parseFloat(risk.computeSlUsd(slPrice, lastCandle.close, stakeUsd, multiplier).toFixed(2));
    const tpUsd   = parseFloat(risk.computeTpUsd(tpPrice, lastCandle.close, stakeUsd, multiplier).toFixed(2));

    decision.side    = side;
    decision.slPrice = slPrice;
    decision.tpPrice = tpPrice;
    decision.slUsd   = slUsd;
    decision.tpUsd   = tpUsd;

    console.log(`  ${side.toUpperCase()} ${symbol} @ ${lastCandle.close.toFixed(4)}`);
    console.log(`  SL ${slPrice.toFixed(4)} ($${slUsd}) | TP ${tpPrice.toFixed(4)} ($${tpUsd})`);

    if (dryRun) {
      console.log(`  [dry-run] order not placed.`);
      decision.notes = "DRY_RUN signal";
    } else {
      try {
        console.log(`  Requesting proposal (up to 3 attempts)...`);
        const { proposal, order } = await placeOrderWithRetry(
          client,
          { symbol: derivSymbol, contractType, amount: stakeUsd, multiplier, slUsd, tpUsd },
          stakeUsd
        );
        decision.contractId  = order.buy.contract_id;
        decision.orderPlaced = true;
        decision.notes       = `Filled @ proposal ${proposal.proposal.id}`;
        console.log(`  Filled. Contract ${order.buy.contract_id}`);
        tradedLevels.add(event.levelKey);
        saveTradedLevels(tradedFile, tradedLevels, stateDir);
      } catch (err) {
        decision.mode  = "ERROR";
        decision.notes = err.message;
        console.log(`  ERROR: ${err.message}`);
      }
    }
  }

  risk.recordDecision(decision);
  console.log(`\n[log] safety-check-log.json updated`);
  console.log("===========================================================\n");

  if (monitorSettlement && decision.orderPlaced && !dryRun) {
    await monitorContract(client, decision.contractId, decision, risk, {
      ...monitorOptions,
      settlementCsvFile,
      nowFn,
    });
  }

  client.close();
  return decision;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// One-time migration from the old shared traded-levels.json → per-symbol file.
// Safe to run on every startup — no-ops if already migrated or old file absent.
function migrateTradedLevels(stateDir, newFile) {
  const oldFile = `${stateDir}/traded-levels.json`;
  if (!existsSync(oldFile)) return;

  if (!existsSync(newFile)) {
    try {
      renameSync(oldFile, newFile);
      console.log(`[migrate] traded-levels.json → ${newFile}`);
    } catch (err) {
      console.log(`[migrate] Could not rename traded-levels file: ${err.message}`);
    }
    return;
  }

  try {
    const archivedTo = archiveFile(oldFile, "legacy");
    console.log(`[migrate] unused shared traded-levels.json archived to ${archivedTo}`);
  } catch (err) {
    console.log(`[migrate] Could not archive shared traded-levels file: ${err.message}`);
  }
}

function loadTradedLevels(filePath) {
  if (!existsSync(filePath)) return new Set();
  try {
    const d = JSON.parse(readFileSync(filePath, "utf8"));
    return new Set(d.ids || []);
  } catch { return new Set(); }
}

function saveTradedLevels(filePath, set, stateDir) {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(filePath, JSON.stringify({ ids: [...set] }, null, 2));
}

// Returns true when the current UTC hour is within [start, end).
// end=24 means end-of-day (always passes since getUTCHours() returns 0-23).
// Handles overnight sessions (start > end) with || logic.
function inSession({ utc_start_hour: start = 0, utc_end_hour: end = 24 }, nowFn = () => new Date()) {
  const hour = nowFn().getUTCHours();
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
