import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import {
  parseTvCsv,
  validateBacktest,
  buildApprovalRecord,
  checkDemoLog,
} from "../scripts/validate-backtest.js";

const FIXTURES = "tests/fixtures/backtests";

export const backtestValidatorTests = [
  {
    name: "parses standard TradingView list-of-trades CSV",
    async run(eq, truthy) {
      const trades = await parseTvCsv(`${FIXTURES}/list-of-trades-standard.csv`);
      eq("closed trade count", trades.length, 3);
      eq("first profit", trades[0].profit, 10.5);
      eq("second cumulative profit", trades[1].cumProfit, 6.25);
    },
  },
  {
    name: "parses quoted currency values with thousands separators",
    async run(eq, truthy) {
      const trades = await parseTvCsv(`${FIXTURES}/list-of-trades-quoted-currency.csv`);
      eq("closed trade count", trades.length, 2);
      eq("quoted positive profit", trades[0].profit, 1250.75);
      eq("quoted negative profit", trades[1].profit, -500.25);
      eq("quoted cumulative profit", trades[1].cumProfit, 750.5);
    },
  },
  {
    name: "parses tab-separated TradingView export",
    async run(eq, truthy) {
      const trades = await parseTvCsv(`${FIXTURES}/list-of-trades-tab.tsv`);
      eq("closed trade count", trades.length, 2);
      eq("tab profit", trades[0].profit, 15);
      eq("tab loss", trades[1].profit, -5);
    },
  },
  {
    name: "skips entry rows in entry/exit paired exports",
    async run(eq, truthy) {
      const trades = await parseTvCsv(`${FIXTURES}/list-of-trades-entry-exit-pairs.csv`);
      eq("closed trade count", trades.length, 2);
      eq("first closed profit", trades[0].profit, 7);
      eq("second closed profit", trades[1].profit, -3);
    },
  },
  {
    name: "does not confuse cumulative profit with per-trade profit",
    async run(eq, truthy) {
      const trades = await parseTvCsv(`${FIXTURES}/list-of-trades-cumulative-first.csv`);
      eq("first per-trade profit", trades[0].profit, 10);
      eq("first cumulative profit", trades[0].cumProfit, 100);
      eq("second per-trade profit", trades[1].profit, -5);
      eq("second cumulative profit", trades[1].cumProfit, 95);
    },
  },
  {
    name: "reports required header failures with file and available headers",
    async run(eq, truthy) {
      let message = "";
      try {
        await parseTvCsv(`${FIXTURES}/list-of-trades-missing-profit.csv`);
      } catch (err) {
        message = err.message;
      }
      truthy("throws missing header error", message.includes("Missing required column"));
      truthy("names missing profit column", message.includes("Profit"));
      truthy("includes fixture file", message.includes("list-of-trades-missing-profit.csv"));
      truthy("lists available headers", message.includes("Available headers"));
    },
  },
  {
    name: "approval record has the top-level boolean contract cycle expects",
    async run(eq, truthy) {
      const record = buildApprovalRecord({
        approved: true,
        files: ["R_75.csv"],
        results: [{ gate: 1, label: "Net profit > 0", pass: true, detail: "ok" }],
        metrics: {
          netProfit: 100,
          winRate: 0.5,
          profitFactor: 2,
          maxDrawdown: 0.1,
          tradeCount: 50,
        },
        wf: { pfIn: 2, pfOut: 1.8, degradation: 0.1 },
        demo: { count: 50, pf: 1.5 },
        now: new Date("2026-04-28T00:00:00.000Z"),
      });
      eq("approved is boolean true", record.approved, true);
      eq("validated_at is deterministic ISO", record.validated_at, "2026-04-28T00:00:00.000Z");
      eq("trade count copied", record.metrics.trade_count, 50);
      truthy("cycle contract remains JSON-readable", JSON.parse(JSON.stringify(record)).approved === true);
    },
  },
  {
    name: "demo log counts normalized settled trades for gate 7",
    async run(eq, truthy) {
      const file = "state-test-demo-log.json";
      try {
        writeFileSync(file, JSON.stringify({
          schemaVersion: 2,
          trades: [
            { orderPlaced: true, outcome: "WIN", pnl_usd: "7.50" },
            { orderPlaced: true, outcome: "loss", pnl_usd: "-3.00" },
            { orderPlaced: true, outcome: null, pnl_usd: null },
            { orderPlaced: false, outcome: "win", pnl_usd: 100 },
          ],
        }, null, 2));
        const demo = checkDemoLog(file);
        eq("settled count", demo.count, 2);
        eq("profit factor from numeric strings", demo.pf, 2.5);
      } finally {
        rmSync(file, { force: true });
      }
    },
  },
  {
    name: "successful validation writes state/backtest-approved.json approved true",
    async run(eq, truthy) {
      const stateDir = "state-test-backtest-validator";
      try {
        rmSync(stateDir, { recursive: true, force: true });
        const result = await validateBacktest({
          files: [`${FIXTURES}/list-of-trades-standard.csv`],
          stateDir,
          demo: { count: 50, pf: 2 },
          gates: {
            minNetProfit: 0,
            minWinRate: 0.3,
            minProfitFactor: 1.0,
            maxDrawdownPct: 1.0,
            minTradesPerSymbol: 3,
            maxWFDegradation: 1.0,
            minDemoSignals: 50,
            minDemoProfitFactor: 1.4,
          },
          logger: { log() {}, error() {} },
          now: new Date("2026-04-28T00:00:00.000Z"),
        });
        truthy("validation passes", result.pass);
        truthy("approval file exists", existsSync(`${stateDir}/backtest-approved.json`));
        const saved = JSON.parse(readFileSync(`${stateDir}/backtest-approved.json`, "utf8"));
        eq("saved approved boolean true", saved.approved, true);
        eq("saved file path", saved.files[0], `${FIXTURES}/list-of-trades-standard.csv`);
      } finally {
        rmSync(stateDir, { recursive: true, force: true });
      }
    },
  },
];
