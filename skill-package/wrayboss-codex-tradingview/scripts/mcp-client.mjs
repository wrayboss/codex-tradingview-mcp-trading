#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const defaults = {
  repoRoot: "C:\\Users\\Administrator\\Documents\\GitHub\\codex-tradingview-mcp-trading",
  externalServer: "C:\\Users\\Administrator\\tradingview-mcp\\src\\server.js",
  tradingViewExe: "C:\\Users\\Administrator\\TradingView-CDP\\TradingView.exe",
  cdpUrl: "http://127.0.0.1:9222",
};

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = exitCode;
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function parseMcpResult(result) {
  const texts = (result?.content || [])
    .filter(item => item.type === "text")
    .map(item => item.text);
  if (texts.length === 1) {
    try { return JSON.parse(texts[0]); } catch { return texts[0]; }
  }
  return texts.length ? texts : result;
}

const repoRoot = process.env.WRAYBOSS_CODEX_REPO || defaults.repoRoot;
const externalServer = process.env.CODEX_TRADINGVIEW_MCP_SERVER || defaults.externalServer;
const tradingViewExe = process.env.TRADINGVIEW_EXE || defaults.tradingViewExe;
const cdpUrl = process.env.TRADINGVIEW_CDP_URL || defaults.cdpUrl;
const serverPath = path.join(repoRoot, "codex-mcp", "server.js");
const sdkRoot = path.join(repoRoot, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");

let client = null;
try {
  requireFile(serverPath, "Codex MCP server");
  requireFile(externalServer, "Full TradingView MCP server");
  requireFile(path.join(sdkRoot, "client", "index.js"), "MCP client SDK");

  const { Client } = await import(pathToFileURL(path.join(sdkRoot, "client", "index.js")).href);
  const { StdioClientTransport } = await import(pathToFileURL(path.join(sdkRoot, "client", "stdio.js")).href);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: repoRoot,
    env: {
      CODEX_TRADINGVIEW_MCP_SERVER: externalServer,
      TRADINGVIEW_CDP_URL: cdpUrl,
      TRADINGVIEW_EXE: tradingViewExe,
      CDP_PORT: "9222",
    },
  });
  client = new Client(
    { name: "wrayboss-chatgpt-skill-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  async function invokeTool(name, args = {}) {
    const response = await client.callTool({ name, arguments: args });
    const parsed = parseMcpResult(response);
    if (response.isError) {
      const message = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new Error(`${name}: ${message}`);
    }
    return parsed;
  }

  const [action = "list", value1, value2 = "{}"] = process.argv.slice(2);
  if (action === "list") {
    const response = await client.listTools();
    emit({ ok: true, action, toolCount: response.tools.length, tools: response.tools });
  } else if (action === "call" || action === "call-file") {
    if (!value1) throw new Error("Tool name is required for call actions.");
    const rawArgs = action === "call-file" ? fs.readFileSync(value2, "utf8") : value2;
    let args;
    try { args = JSON.parse(rawArgs || "{}"); }
    catch (error) { throw new Error(`Arguments JSON is invalid: ${error.message}`); }
    const result = await invokeTool(value1, args);
    emit({ ok: true, action, tool: value1, result });
  } else if (action === "batch-file") {
    if (!value1) throw new Error("Batch file path is required.");
    const requests = JSON.parse(fs.readFileSync(value1, "utf8"));
    if (!Array.isArray(requests)) throw new Error("Batch file must contain a JSON array.");
    const results = [];
    for (const request of requests) {
      const name = request?.name;
      if (!name) {
        results.push({ ok: false, error: "Batch request is missing name." });
        continue;
      }
      try {
        const result = await invokeTool(name, request.arguments || {});
        results.push({ ok: true, tool: name, result });
      } catch (error) {
        results.push({ ok: false, tool: name, error: error?.message || String(error) });
      }
    }
    const allOk = results.every(item => item.ok);
    emit({ ok: allOk, action, results }, allOk ? 0 : 2);
  } else if (action === "verify-markup") {
    let entityId = null;
    const evidence = {};
    try {
      evidence.before = await invokeTool("draw_list", {});
      const quote = await invokeTool("quote_get", {});
      const price = Number(quote.last ?? quote.close ?? quote.price);
      if (!Number.isFinite(price)) throw new Error("quote_get returned no usable price.");
      const label = `WRAYBOSS_SKILL_TEST_${new Date().toISOString().replace(/[-:.]/g, "")}`;
      evidence.label = label;
      const created = await invokeTool("draw_shape", {
        shape: "text",
        point: { time: Math.floor(Date.now() / 1000), price },
        text: label,
      });
      entityId = created?.entity_id;
      if (!entityId) throw new Error("draw_shape returned no entity ID.");
      evidence.entityId = entityId;
      evidence.created = created;

      const listed = await invokeTool("draw_list", {});
      if (!JSON.stringify(listed).includes(entityId)) {
        throw new Error("Created drawing was not found in draw_list.");
      }
      evidence.listed = true;

      const removed = await invokeTool("draw_remove_one", { entity_id: entityId });
      if (removed?.removed !== true) throw new Error("draw_remove_one did not confirm removal.");
      evidence.removed = removed;

      const final = await invokeTool("draw_list", {});
      if (JSON.stringify(final).includes(entityId)) {
        throw new Error("Temporary drawing remains after cleanup.");
      }
      evidence.final = final;
      entityId = null;
      emit({ ok: true, action, evidence });
    } catch (error) {
      let cleanup = null;
      if (entityId) {
        try { cleanup = await invokeTool("draw_remove_one", { entity_id: entityId }); }
        catch (cleanupError) { cleanup = { error: cleanupError?.message || String(cleanupError) }; }
      }
      emit({
        ok: false,
        action,
        error: error?.message || String(error),
        entityId,
        cleanup,
        evidence,
      }, 2);
    }
  } else {
    throw new Error(`Unsupported action: ${action}. Use list, call, call-file, batch-file, or verify-markup.`);
  }
} catch (error) {
  emit({
    ok: false,
    error: error?.message || String(error),
    stack: process.env.WRAYBOSS_SKILL_DEBUG === "true" ? error?.stack : undefined,
  }, 1);
} finally {
  if (client) await client.close().catch(() => {});
}
