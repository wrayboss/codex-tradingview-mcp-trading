/**
 * Breakout + Retest V1 — Deriv synthetic indices bot.
 *
 * Run modes:
 *   node bot.js            -> single cycle, one signal attempt
 *   node bot.js --dry-run  -> single cycle, no orders placed
 *   node bot.js --loop     -> autonomous loop, all symbols, every 15m bar close
 *   node bot.js --loop --dry-run -> loop, no orders
 */

import "dotenv/config";
import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync, unlinkSync } from "fs";
import { CSV_FILE, CSV_HEADERS, STATE_DIR, prepareRuntimeArtifacts } from "./src/artifacts.js";
import { loadRules }       from "./src/rulesLoader.js";
import { RiskManager }     from "./src/riskManager.js";
import { runCycle }        from "./src/cycle.js";
import { normalizeSyntheticSymbol } from "./src/symbols.js";

const DRY_RUN   = process.argv.includes("--dry-run");
const LOOP_MODE = process.argv.includes("--loop");

const PID_FILE  = `${STATE_DIR}/bot.pid`;

// ─── PID lock (atomic via O_CREAT|O_EXCL) ─────────────────────────────────────
function acquirePidLock() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  try {
    writeFileSync(PID_FILE, String(process.pid), { flag: "wx" });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    const pid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
    try {
      process.kill(pid, 0);
      console.error(`[pid] Bot already running (PID ${pid}). Exiting to prevent concurrent writes.`);
      process.exit(0);
    } catch {
      console.log(`[pid] Stale lock for PID ${pid} — replacing.`);
      unlinkSync(PID_FILE);
      writeFileSync(PID_FILE, String(process.pid), { flag: "wx" });
    }
  }
}

function releasePidLock() {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch {}
}

// ─── Timing ────────────────────────────────────────────────────────────────────
function msUntilNextBarClose(granSec, bufferMs = 2000) {
  const now  = Date.now();
  const gran = granSec * 1000;
  const next = Math.ceil((now + 1) / gran) * gran;
  return (next - now) + bufferMs;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── CSV ───────────────────────────────────────────────────────────────────────
function initCsv() {
  if (!existsSync(CSV_FILE)) writeFileSync(CSV_FILE, CSV_HEADERS + "\n");
}

function logArtifactAction(kind, result) {
  if (result.action === "archived") {
    console.log(`[migrate] ${kind} legacy schema archived to ${result.archivedTo}`);
  } else if (result.action === "created") {
    console.log(`[migrate] ${kind} initialized`);
  }
}

function appendCsv(decision) {
  const t = new Date(decision.timestamp);
  const row = [
    t.toISOString().slice(0, 10),
    t.toISOString().slice(11, 19),
    "Deriv",
    decision.symbol,
    decision.side || "",
    decision.stakeUsd ?? "",
    decision.multiplier ?? "",
    decision.slUsd  != null ? decision.slUsd.toFixed(2)  : "",
    decision.tpUsd  != null ? decision.tpUsd.toFixed(2)  : "",
    decision.contractId || "",
    decision.mode,
    "",
    "",
    `"${(decision.notes || "").replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`,
  ].join(",");
  appendFileSync(CSV_FILE, row + "\n");
}

function appendCsvSettlement(decision) {
  const t = new Date();
  const row = [
    t.toISOString().slice(0, 10),
    t.toISOString().slice(11, 19),
    "Deriv",
    decision.symbol,
    decision.side || "",
    "", "", "", "",
    decision.contractId || "",
    "SETTLE",
    decision.outcome || "",
    decision.pnl_usd != null ? Number(decision.pnl_usd).toFixed(2) : "",
    `"settled"`,
  ].join(",");
  appendFileSync(CSV_FILE, row + "\n");
}

// ─── Banner ────────────────────────────────────────────────────────────────────
function banner(rules, symbols, stakeUsd, multiplier, stopLossUsd, maxTradesDay) {
  const mode = [DRY_RUN ? "DRY RUN" : "LIVE", LOOP_MODE ? "LOOP" : "SINGLE"].join(" | ");
  console.log("===========================================================");
  console.log("  Breakout + Retest V1 - Deriv Multipliers");
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  Strategy : ${rules.strategy}`);
  console.log(`  Symbols  : ${symbols.join(", ")}`);
  console.log(`  TF       : structure ${rules.timeframes.structure}m / entry ${rules.timeframes.entry}m`);
  console.log(`  Stake    : $${stakeUsd} x ${multiplier}x | SL cap $${stopLossUsd}`);
  console.log(`  Max/day  : ${maxTradesDay} trades`);
  console.log(`  Mode     : ${mode}`);
  console.log("===========================================================");
}

// ─── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  const rules = loadRules("./rules.json");

  const stakeUsd      = parseFloat(process.env.STAKE_USD        || rules.risk.stake_usd);
  const multiplier    = parseInt(process.env.MULTIPLIER          || rules.execution.multiplier, 10);
  const stopLossUsd   = parseFloat(process.env.STOP_LOSS_USD     || rules.risk.stop_loss_usd);
  const maxTradesDay  = parseInt(process.env.MAX_TRADES_PER_DAY  || rules.risk.max_trades_per_day, 10);
  const apiToken      = process.env.DERIV_API_TOKEN;
  const appId         = process.env.DERIV_APP_ID || "129133";

  if (!apiToken || apiToken.startsWith("your_")) {
    console.error("ERROR: Set DERIV_API_TOKEN in .env");
    process.exit(1);
  }
  if (!Number.isFinite(stakeUsd) || stakeUsd <= 0) {
    console.error(`ERROR: STAKE_USD must be a positive number (got "${process.env.STAKE_USD}")`);
    process.exit(1);
  }
  if (!Number.isInteger(multiplier) || multiplier <= 0) {
    console.error(`ERROR: MULTIPLIER must be a positive integer (got "${process.env.MULTIPLIER}")`);
    process.exit(1);
  }

  // Resolve active symbol list: SYMBOL env var overrides to single symbol
  let symbols = rules.symbols;
  const envSymbol = process.env.SYMBOL;
  if (envSymbol && !rules.symbols.includes(envSymbol)) {
    console.error(`ERROR: SYMBOL=${envSymbol} not in rules.symbols (${rules.symbols.join(", ")}). Refusing to start.`);
    process.exit(1);
  }
  if (envSymbol) symbols = [envSymbol];

  // Apply env overrides to risk rules
  const riskRules = { ...rules.risk, stop_loss_usd: stopLossUsd, max_trades_per_day: maxTradesDay };

  const artifacts = prepareRuntimeArtifacts({ stateDir: STATE_DIR, csvFile: CSV_FILE });
  logArtifactAction("trades.csv", artifacts.csv);
  logArtifactAction("safety-check-log.json", artifacts.safetyLog);
  initCsv();
  banner(rules, symbols, stakeUsd, multiplier, stopLossUsd, maxTradesDay);

  const risk = new RiskManager(riskRules);
  risk.load();

  acquirePidLock();

  const shutdown = () => {
    console.log("\n[bot] Shutdown signal received — cleaning up.");
    releasePidLock();
    process.exit(0);
  };
  process.once("SIGINT",  shutdown);
  process.once("SIGTERM", shutdown);

  // Shared cycle options
  const cycleOpts = (monitorSettlement) => ({
    dryRun: DRY_RUN,
    monitorSettlement,
    stateDir: STATE_DIR,
  });

  try {
    if (LOOP_MODE) {
      const ltfGranSec = parseInt(rules.timeframes.entry, 10) * 60;
      console.log(`[loop] Autonomous mode — cycling every ${rules.timeframes.entry}m bar close | symbols: ${symbols.join(", ")}`);

      while (true) {
        const waitMs  = msUntilNextBarClose(ltfGranSec);
        const nextUtc = new Date(Date.now() + waitMs).toISOString().slice(11, 19);
        console.log(`[loop] Next bar close at ${nextUtc} UTC (in ${(waitMs / 60000).toFixed(1)}m)`);
        await sleep(waitMs);

        for (const symbol of symbols) {
          const derivSymbol = normalizeSyntheticSymbol(symbol);
          console.log(`\n[loop] ===== ${symbol} ${new Date().toISOString()} =====`);
          try {
            const config = { symbol, derivSymbol, stakeUsd, multiplier, apiToken, appId };
            // In loop mode, no settlement monitor — reconcile handles outcomes next cycle
            const decision = await runCycle(config, rules, risk, cycleOpts(false));
            if (decision?.side    != null) appendCsv(decision);
            if (decision?.outcome != null) appendCsvSettlement(decision);
          } catch (err) {
            console.error(`[loop] ${symbol} cycle error: ${err.message} — continuing`);
          }
        }
      }
    } else {
      // Single cycle — use SYMBOL env or first symbol
      const symbol      = symbols[0];
      const derivSymbol = normalizeSyntheticSymbol(symbol);
      const config      = { symbol, derivSymbol, stakeUsd, multiplier, apiToken, appId };

      // Single-cycle mode: stay alive monitoring the contract until settlement
      const decision = await runCycle(config, rules, risk, cycleOpts(true));
      if (decision) {
        if (decision.side != null) appendCsv(decision);
        if (decision.outcome) {
          appendCsvSettlement(decision);
          console.log(`[log] trades.csv settlement row appended`);
        }
      }
    }
  } finally {
    releasePidLock();
  }
}

main().catch(err => {
  console.error("Bot error:", err);
  releasePidLock();
  process.exit(1);
});
