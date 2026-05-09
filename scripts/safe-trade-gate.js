#!/usr/bin/env node
import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import { DerivClient } from "../src/derivClient.js";
import { buildSafeTradeGateReport, formatSafeTradeGateReport } from "../src/safeTradeGate.js";

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readJsonFile(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function readDerivState() {
  const apiToken = process.env.DERIV_API_TOKEN;
  if (!apiToken || apiToken.startsWith("your_")) {
    throw new Error("DERIV_API_TOKEN is required for --check-deriv.");
  }
  const client = new DerivClient({ apiToken, appId: process.env.DERIV_APP_ID || "129133" });
  try {
    await client.connect();
    const account = await client.authorize();
    const openPositions = await client.openPositions();
    return { account, openPositions };
  } finally {
    client.close();
  }
}

async function main() {
  const json = hasFlag("json");
  const explicitExecutionRequest = hasFlag("explicit");
  const networkCalls = hasFlag("check-deriv");
  const approval = readJsonFile(argValue("approval") || "state/backtest-approved.json", null);
  let account = readJsonFile(argValue("account"), null);
  let openPositions = readJsonFile(argValue("open-positions"), null);

  if (hasFlag("assume-demo")) {
    account = { loginid: "ASSUMED_DEMO", is_virtual: true, currency: "USD" };
  }
  if (hasFlag("assume-no-open-positions")) {
    openPositions = [];
  }
  if (networkCalls) {
    const derivState = await readDerivState();
    account = derivState.account;
    openPositions = derivState.openPositions;
  }

  const report = buildSafeTradeGateReport({
    explicitExecutionRequest,
    env: process.env,
    account,
    approval,
    openPositions,
    networkCalls,
  });

  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatSafeTradeGateReport(report));
  process.exit(report.allowed ? 0 : 1);
}

main().catch(err => {
  console.error(`[safe-trade-gate] ${err?.message || String(err)}`);
  process.exit(1);
});
