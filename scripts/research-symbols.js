#!/usr/bin/env node
import "dotenv/config";
import { DerivClient } from "../src/derivClient.js";
import { formatDerivActiveSymbols, getResearchSymbolCatalog } from "../src/derivSymbolRegistry.js";

const json = process.argv.includes("--json");
const live = !process.argv.includes("--offline");

async function loadSymbols() {
  if (!live) return { source: "repo-fallback", symbols: getResearchSymbolCatalog() };
  const client = new DerivClient({ appId: process.env.DERIV_APP_ID || "129133" });
  try {
    await client.connect();
    const raw = await client.activeSymbols({ productType: "basic" });
    return { source: "deriv-active_symbols", symbols: formatDerivActiveSymbols(raw) };
  } finally {
    client.close();
  }
}

const result = await loadSymbols();
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`source: ${result.source}`);
  for (const item of result.symbols) {
    const gate = item.executionSupported ? "execution" : "research";
    console.log(`${item.symbol.padEnd(20)} ${item.derivSymbol.padEnd(10)} ${item.tradingViewSymbol.padEnd(34)} ${gate} ${item.displayName}`);
  }
}
