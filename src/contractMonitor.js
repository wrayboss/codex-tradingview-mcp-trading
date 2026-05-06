import { appendSettlementCsvRowOnce, applySettlement } from "./artifacts.js";
import { appendTradeEventOnce } from "./tradeJournal.js";
import { createDecisionId, createSettlementId } from "./tradeIdentity.js";
import { formatErrorMessage, warnRuntime } from "./runtimeWarnings.js";

const DEFAULT_POLL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Poll Deriv until the contract settles (is_sold=true) or timeout/interrupt.
 * Mutates decision.outcome and decision.pnl_usd in-place, then calls risk.save().
 *
 * Returns { outcome: "win"|"loss"|null, pnl: number|null }
 */
export async function monitorContract(client, contractId, decision, risk, opts = {}) {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nowFn = opts.nowFn ?? (() => new Date());
  const start = Date.now();

  console.log(`\n[monitor] Contract ${contractId} - polling every ${pollMs / 1000}s (max ${timeoutMs / 3_600_000}h)`);

  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    while (!interrupted && Date.now() - start < timeoutMs) {
      await sleep(pollMs);
      if (interrupted) break;

      try {
        const r = await client.contractStatus(contractId);
        const c = r?.proposal_open_contract;

        if (!c) {
          console.log(`[monitor] No data for ${contractId}, retrying...`);
          continue;
        }

        const elapsedMin = ((Date.now() - start) / 60_000).toFixed(1);
        const pnlStr = c.profit != null ? `$${Number(c.profit).toFixed(2)}` : "?";
        console.log(`[monitor] ${elapsedMin}m | sold=${c.is_sold} | pnl=${pnlStr}`);

        if (c.is_sold) {
          const settlement = applySettlement(decision, c);
          risk.save();
          if (opts.settlementCsvFile) {
            try {
              appendSettlementCsvRowOnce(decision, { filePath: opts.settlementCsvFile, settledAt: nowFn() });
            } catch (err) {
              warnRuntime("artifact", `Failed to write settlement CSV for ${decision.contractId}: ${formatErrorMessage(err)}`);
            }
          }
          const eventId = createSettlementId(decision);
          if (eventId) {
            try {
              appendTradeEventOnce({
                eventId,
                eventType: "SETTLEMENT_RECORDED",
                timestamp: nowFn().toISOString(),
                contractId: decision.contractId,
                decisionId: createDecisionId(decision),
                symbol: decision.symbol,
                derivSymbol: decision.derivSymbol,
                mode: decision.mode,
              payload: {
                  outcome: decision.outcome,
                  pnl_usd: decision.pnl_usd,
                  source: "monitor",
                },
              }, { filePath: opts.tradeEventsFile });
            } catch (err) {
              warnRuntime("journal", `Failed to append settlement event for ${decision.contractId}: ${formatErrorMessage(err)}`);
            }
          }
          console.log(`[monitor] SETTLED - ${decision.outcome.toUpperCase()} | P&L ${pnlStr}`);
          return settlement;
        }
      } catch (err) {
        warnRuntime("reconcile", `Contract ${contractId} monitor status unavailable: ${formatErrorMessage(err)} - retrying`);
      }
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  const reason = interrupted ? "interrupted" : `timeout after ${timeoutMs / 3_600_000}h`;
  console.log(`[monitor] ${reason}. Contract ${contractId} still open - will reconcile on next run.`);
  return { outcome: null, pnl: null };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
