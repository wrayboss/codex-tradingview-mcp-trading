#!/usr/bin/env node
import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import { getResearchSymbolCatalog } from "../src/derivSymbolRegistry.js";
import { getOperatorWatchlist } from "../src/watchlist.js";

function redactedEnvReport(env = process.env) {
  const token = env.DERIV_API_TOKEN || "";
  return {
    envExists: existsSync(".env"),
    DERIV_API_TOKEN_set: Boolean(token && !token.startsWith("your_") && token.length > 8),
    DERIV_APP_ID_set: Boolean(env.DERIV_APP_ID),
    SYMBOL: env.SYMBOL || "<unset>",
    STAKE_USD: env.STAKE_USD || "<unset>",
    MULTIPLIER: env.MULTIPLIER || "<unset>",
    ALLOW_REAL_TRADING_set: Boolean(env.ALLOW_REAL_TRADING),
    TRADING_KILL_SWITCH: env.TRADING_KILL_SWITCH || "<unset>",
  };
}

function loadPackage() {
  return JSON.parse(readFileSync("package.json", "utf8"));
}

function buildReport() {
  const pkg = loadPackage();
  const executionWatchlist = getOperatorWatchlist();
  const researchCatalog = getResearchSymbolCatalog();
  const approvalPath = "state/backtest-approved.json";

  return {
    package: {
      name: pkg.name,
      version: pkg.version,
    },
    env: redactedEnvReport(),
    execution: {
      symbols: executionWatchlist.map(item => item.symbol),
      derivSymbols: executionWatchlist.map(item => item.derivSymbol),
      backtestApprovalExists: existsSync(approvalPath),
      approvalPath,
    },
    research: {
      catalogCount: researchCatalog.length,
      executionEligibleCount: researchCatalog.filter(item => item.executionSupported).length,
      readOnlyTools: [
        "deriv_active_symbols",
        "deriv_research_candles",
        "tv_research_set_chart",
      ],
    },
    safety: {
      liveToolHiddenByDefault: process.env.CODEX_ALLOW_LIVE_TRADING !== "true",
      liveExecutionRequiresExplicitCommand: true,
      secretsPrinted: false,
    },
  };
}

function printHuman(report) {
  console.log(`Codex doctor: ${report.package.name}@${report.package.version}`);
  console.log(`env: DERIV_API_TOKEN_set=${report.env.DERIV_API_TOKEN_set}, SYMBOL=${report.env.SYMBOL}`);
  console.log(`execution symbols: ${report.execution.symbols.join(", ")}`);
  console.log(`backtest approval: ${report.execution.backtestApprovalExists ? "present" : "missing"} (${report.execution.approvalPath})`);
  console.log(`research catalogue: ${report.research.catalogCount} symbols, ${report.research.executionEligibleCount} execution-eligible`);
  console.log(`research tools: ${report.research.readOnlyTools.join(", ")}`);
}

const report = buildReport();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHuman(report);
}
