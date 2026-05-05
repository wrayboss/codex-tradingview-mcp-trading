#!/usr/bin/env node
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { DerivClient } from "../src/derivClient.js";
import { resolveResearchSymbol } from "../src/derivSymbolRegistry.js";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const symbolArg = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : "VOLATILITY_75";
const count = Number.parseInt(argValue("count", "500"), 10);
const granularity = Number.parseInt(argValue("granularity", "900"), 10);
const json = process.argv.includes("--json");

if (!Number.isInteger(count) || count <= 0 || count > 5000) {
  throw new Error("--count must be an integer between 1 and 5000.");
}
if (!Number.isInteger(granularity) || granularity <= 0) {
  throw new Error("--granularity must be a positive integer in seconds.");
}

const resolved = resolveResearchSymbol(symbolArg);
const client = new DerivClient({ appId: process.env.DERIV_APP_ID || "129133" });
await client.connect();
try {
  const candles = await client.candles({
    symbol: resolved.derivSymbol,
    granularity,
    count,
  });
  const outputDir = path.join("state", "research", "candles");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${resolved.symbol}-${granularity}s-${candles.length}.json`);
  const payload = {
    fetchedAt: new Date().toISOString(),
    symbol: resolved.symbol,
    derivSymbol: resolved.derivSymbol,
    tradingViewSymbol: resolved.tradingViewSymbol,
    executionEligible: resolved.executionSupported,
    granularity,
    count: candles.length,
    candles,
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  const summary = { outputPath, symbol: resolved.symbol, derivSymbol: resolved.derivSymbol, tradingViewSymbol: resolved.tradingViewSymbol, count: candles.length };
  if (json) console.log(JSON.stringify(summary, null, 2));
  else console.log(`wrote ${candles.length} candles for ${resolved.symbol} to ${outputPath}`);
} finally {
  client.close();
}
