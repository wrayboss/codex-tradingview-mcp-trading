#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { parseError: true };
  }
}

const pkg = readJson("package.json");
const rules = readJson("rules.json");
const approval = readJson("state/backtest-approved.json");
const envExists = existsSync(".env");
const bridgeCheck = run(process.execPath, ["codex-mcp/server.js", "--self-test"]);

const summary = {
  repo: process.cwd(),
  package: pkg ? { name: pkg.name, version: pkg.version } : null,
  envFilePresent: envExists,
  supportedSymbols: rules?.symbols || [],
  strategy: rules ? { name: rules.strategy, version: rules.version, entryTimeframe: rules.timeframes?.entry } : null,
  backtestApproved: approval?.approved === true,
  backtestApprovalFilePresent: approval != null,
  codexBridge: {
    ok: bridgeCheck.ok,
    status: bridgeCheck.status,
    tools: [],
    stderr: bridgeCheck.stderr,
  },
};

if (bridgeCheck.stdout) {
  try {
    const parsed = JSON.parse(bridgeCheck.stdout);
    summary.codexBridge.tools = parsed.tools || [];
  } catch {
    summary.codexBridge.stdout = bridgeCheck.stdout;
  }
}

console.log(JSON.stringify(summary, null, 2));
