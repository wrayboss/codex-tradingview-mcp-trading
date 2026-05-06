#!/usr/bin/env node
import { buildRuntimeHealthReport, formatRuntimeHealthReport } from "../src/runtimeHealth.js";

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

try {
  const report = buildRuntimeHealthReport();
  if (hasFlag("json")) console.log(JSON.stringify(report, null, 2));
  else console.log(formatRuntimeHealthReport(report));
  process.exit(0);
} catch (err) {
  console.error(`[runtime-health] ${err?.message || String(err)}`);
  process.exit(1);
}
