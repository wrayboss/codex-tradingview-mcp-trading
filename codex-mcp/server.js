#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createCodexTools } from "./tools.js";

function asMcpTextResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createServer(toolRegistry = createCodexTools()) {
  const server = new Server(
    { name: "deriv-trading-codex-bridge", version: "1.0.0" },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "Repo-local Codex bridge for TradingView CDP and Deriv dry-run trading analysis. Live trade placement is disabled unless explicitly enabled by environment.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolRegistry.list(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await toolRegistry.call(request.params.name, request.params.arguments || {});
      return asMcpTextResult(result);
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error.message || String(error) }],
      };
    }
  });

  return server;
}

if (process.argv.includes("--self-test")) {
  const tools = createCodexTools();
  const names = tools.list().map(t => t.name);
  console.log(JSON.stringify({ ok: true, toolCount: names.length, tools: names }, null, 2));
} else {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
