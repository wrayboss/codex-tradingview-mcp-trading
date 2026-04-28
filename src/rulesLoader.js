import { readFileSync } from "fs";

const REQUIRED = ["strategy", "symbols", "timeframes", "structure", "indicators", "breakout", "retest", "confirmation", "trend_filter", "risk"];

export function loadRules(path) {
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch (e) { throw new Error(`Could not read ${path}: ${e.message}`); }
  let rules;
  try { rules = JSON.parse(raw); }
  catch (e) { throw new Error(`Invalid JSON in ${path}: ${e.message}`); }
  for (const k of REQUIRED) {
    if (!(k in rules)) throw new Error(`rules.json missing required key: ${k}`);
  }
  if (!Array.isArray(rules.symbols) || rules.symbols.length === 0) {
    throw new Error(`rules.json: symbols must be a non-empty array`);
  }
  return rules;
}
