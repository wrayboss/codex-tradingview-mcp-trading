#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
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
  const filePath = resolve(repoRoot, path);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return { parseError: true };
  }
}

const pkg = readJson("package.json");
const rules = readJson("rules.json");
const approval = readJson("state/backtest-approved.json");
const envExists = existsSync(resolve(repoRoot, ".env"));
const bridgeCheck = run(process.execPath, ["codex-mcp/server.js", "--self-test"]);

const summary = {
  repo: repoRoot,
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
