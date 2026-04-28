import "dotenv/config";
import { spawn } from "child_process";
import WebSocket from "ws";
import { DerivClient } from "../src/derivClient.js";
import { normalizeSyntheticSymbol } from "../src/symbols.js";

export { normalizeSyntheticSymbol };

function textSchema(description, properties = {}, required = []) {
  return {
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

function defaultTvClient() {
  const baseUrl = process.env.TRADINGVIEW_CDP_URL || "http://127.0.0.1:9222";
  async function withChartPage(fn) {
    const targetsRes = await fetch(`${baseUrl}/json`);
    if (!targetsRes.ok) throw new Error(`TradingView CDP target list returned HTTP ${targetsRes.status}`);
    const targets = await targetsRes.json();
    const target = targets.find(t => t.url && t.url.includes("tradingview.com/chart/"));
    if (!target) throw new Error("No open TradingView chart target found.");

    let id = 0;
    const pending = new Map();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    ws.on("message", raw => {
      const msg = JSON.parse(raw);
      if (!pending.has(msg.id)) return;
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "TradingView evaluation failed");
      }
      return result.result.value;
    };
    const click = async (x, y) => {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    };
    const pressEscape = async () => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    };
    const pressControlA = async () => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 2, key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    };
    const insertText = async (text) => {
      await send("Input.insertText", { text });
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      await send("Runtime.enable");
      return await fn({ evaluate, click, pressEscape, pressControlA, insertText, wait });
    } finally {
      ws.close();
    }
  }

  const listIndicatorsFromDom = `(() => [...document.querySelectorAll('.item-l31H9iuA.study-l31H9iuA')]
    .map(row => {
      const title = row.querySelector('[title]')?.getAttribute('title')?.trim() || '';
      const rowText = (row.innerText || '').trim().replace(/\\s+/g, ' ');
      const name = rowText.split(/\\s+/)[0] || title || rowText;
      const rect = row.getBoundingClientRect();
      return { name, title, rowText, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
    .filter(x => x.rowText || x.title))()`;

  return {
    async health() {
      const res = await fetch(`${baseUrl}/json/version`);
      if (!res.ok) throw new Error(`TradingView CDP returned HTTP ${res.status}`);
      const data = await res.json();
      return {
        connected: true,
        browser: data.Browser,
        protocolVersion: data["Protocol-Version"],
        webSocketDebuggerUrl: data.webSocketDebuggerUrl ? "available" : "missing",
      };
    },
    async state() {
      const res = await fetch(`${baseUrl}/json`);
      if (!res.ok) throw new Error(`TradingView CDP target list returned HTTP ${res.status}`);
      const targets = await res.json();
      return {
        targetCount: targets.length,
        targets: targets.map(t => ({ id: t.id, type: t.type, title: t.title, url: t.url })),
      };
    },
    async listIndicators() {
      return withChartPage(async ({ evaluate }) => evaluate(listIndicatorsFromDom));
    },
    async addIndicator({ name = "Moving Average Exponential" } = {}) {
      return withChartPage(async ({ evaluate, click, pressControlA, insertText, pressEscape, wait }) => {
        const before = await evaluate(listIndicatorsFromDom);
        const openButton = await evaluate(`(() => {
          const buttons = [...document.querySelectorAll('button[data-name="open-indicators-dialog"], button')];
          const btn = buttons.find(b => b.getAttribute('data-name') === 'open-indicators-dialog' || /Indicators, metrics/i.test(b.getAttribute('aria-label') || ''));
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
        if (!openButton) throw new Error("TradingView Indicators button not found.");
        await click(openButton.x, openButton.y);
        await wait(800);

        const search = await evaluate(`(() => {
          const input = [...document.querySelectorAll('input')].find(i => i.placeholder === 'Search' && i.getBoundingClientRect().width > 0);
          if (!input) return null;
          const r = input.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
        if (!search) throw new Error("TradingView indicator search input not found.");
        await click(search.x, search.y);
        await pressControlA();
        await insertText(name);
        await wait(900);

        const row = await evaluate(`(() => {
          const target = ${JSON.stringify(name)};
          const rows = [...document.querySelectorAll('div,button,[role=option]')].map(el => {
            const r = el.getBoundingClientRect();
            const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
            return { text, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
          }).filter(x => x.visible && x.text === target && x.w > 100);
          return rows[0] || null;
        })()`);
        if (!row) throw new Error(`Indicator result not found: ${name}`);
        await click(row.x + Math.min(row.w - 20, 220), row.y + row.h / 2);
        await wait(1200);
        await pressEscape();
        await wait(300);

        const after = await evaluate(listIndicatorsFromDom);
        return { added: true, name, beforeCount: before.length, afterCount: after.length, indicators: after };
      });
    },
    async removeIndicator({ name = "EMA" } = {}) {
      return withChartPage(async ({ evaluate, click, pressEscape, wait }) => {
        await pressEscape();
        await wait(300);
        let removed = 0;
        const pattern = String(name).toLowerCase();
        const findRowsExpression = `(() => [...document.querySelectorAll('.item-l31H9iuA.study-l31H9iuA')]
          .filter(row => ((row.innerText || '') + ' ' + ([...row.querySelectorAll('[title]')].map(x => x.getAttribute('title')).join(' '))).toLowerCase().includes(${JSON.stringify(pattern)}))
          .map(row => {
            const rr = row.getBoundingClientRect();
            const btn = [...row.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Remove' || b.title === 'Remove');
            const br = btn?.getBoundingClientRect();
            return { rowText: row.innerText.trim().replace(/\\s+/g, ' '), rowX: rr.x, rowY: rr.y, rowW: rr.width, rowH: rr.height, removeX: br ? br.x + br.width / 2 : null, removeY: br ? br.y + br.height / 2 : null };
          }))()`;

        for (let attempt = 0; attempt < 8; attempt++) {
          const rows = await evaluate(findRowsExpression);
          if (!rows.length) break;
          const row = rows[0];
          await click(row.rowX + 20, row.rowY + row.rowH / 2);
          await wait(120);
          await click(row.removeX || row.rowX + 174, row.removeY || row.rowY + row.rowH / 2);
          removed++;
          await wait(600);
        }
        const remaining = await evaluate(findRowsExpression);
        return { removed, name, remaining };
      });
    },
  };
}

function defaultDerivClientFactory() {
  const apiToken = process.env.DERIV_API_TOKEN;
  if (!apiToken || apiToken === "your_deriv_token_here" || apiToken === "your_token_here") {
    throw new Error("Set DERIV_API_TOKEN in .env before using Deriv-backed Codex tools.");
  }
  return new DerivClient({ apiToken, appId: process.env.DERIV_APP_ID || "129133" });
}

function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), shell: false, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function defaultStrategyEvaluator(args = {}) {
  const result = await runCommand(process.execPath, ["bot.js", "--dry-run"], args.timeoutMs || 120000);
  return {
    mode: "DRY_RUN",
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function createCodexTools({
  allowLiveTrading = process.env.CODEX_ALLOW_LIVE_TRADING === "true",
  tvClient = defaultTvClient(),
  derivClientFactory = defaultDerivClientFactory,
  strategyEvaluator = defaultStrategyEvaluator,
} = {}) {
  const toolDefs = new Map();
  const handlers = new Map();

  const addTool = (name, definition, handler) => {
    toolDefs.set(name, { name, ...definition });
    handlers.set(name, handler);
  };

  addTool(
    "tv_health_check",
    textSchema("Check whether TradingView Desktop CDP is reachable on port 9222."),
    async () => tvClient.health(),
  );

  addTool(
    "tv_get_state",
    textSchema("Return basic TradingView CDP target state without controlling Claude Code's MCP connection."),
    async () => tvClient.state(),
  );

  addTool(
    "tv_list_indicators",
    textSchema("List indicator/study rows currently visible in the active TradingView chart legend."),
    async () => ({ indicators: await tvClient.listIndicators() }),
  );

  addTool(
    "tv_add_indicator",
    textSchema(
      "Add an indicator to the active TradingView chart through Codex's isolated CDP bridge.",
      { name: { type: "string", default: "Moving Average Exponential" } },
    ),
    async (args) => tvClient.addIndicator(args),
  );

  addTool(
    "tv_remove_indicator",
    textSchema(
      "Remove matching indicators from the active TradingView chart legend through Codex's isolated CDP bridge.",
      { name: { type: "string", default: "EMA" } },
    ),
    async (args) => tvClient.removeIndicator(args),
  );

  addTool(
    "deriv_account_summary",
    textSchema("Authorize against Deriv and return non-secret account metadata."),
    async () => {
      const client = derivClientFactory();
      try {
        if (client.connect) await client.connect();
        const account = await client.authorize();
        return {
          loginid: account.loginid,
          is_virtual: account.is_virtual,
          currency: account.currency,
          balance: account.balance,
        };
      } finally {
        client.close?.();
      }
    },
  );

  addTool(
    "deriv_candles",
    textSchema(
      "Fetch Deriv candles for VOLATILITY_75 or VOLATILITY_50.",
      {
        symbol: { type: "string", enum: ["VOLATILITY_75", "VOLATILITY_50", "R_75", "R_50"] },
        granularity: { type: "number", default: 900 },
        count: { type: "number", default: 100 },
      },
      ["symbol"],
    ),
    async (args) => {
      const client = derivClientFactory();
      try {
        if (client.connect) await client.connect();
        if (client.authorize) await client.authorize();
        const candles = await client.candles({
          symbol: normalizeSyntheticSymbol(args.symbol),
          granularity: args.granularity || 900,
          count: args.count || 100,
        });
        return { symbol: normalizeSyntheticSymbol(args.symbol), candles };
      } finally {
        client.close?.();
      }
    },
  );

  addTool(
    "strategy_evaluate_dry_run",
    textSchema("Run the existing strategy in dry-run mode. This never places orders."),
    async (args) => strategyEvaluator(args),
  );

  if (allowLiveTrading) {
    addTool(
      "deriv_place_multiplier_trade",
      textSchema(
        "Place a Deriv multiplier trade. Hidden unless CODEX_ALLOW_LIVE_TRADING=true.",
        {
          symbol: { type: "string", enum: ["VOLATILITY_75", "VOLATILITY_50", "R_75", "R_50"] },
          side: { type: "string", enum: ["long", "short"] },
          stakeUsd: { type: "number" },
          multiplier: { type: "number" },
          stopLossUsd: { type: "number" },
          takeProfitUsd: { type: "number" },
        },
        ["symbol", "side", "stakeUsd", "multiplier", "stopLossUsd"],
      ),
      async () => {
        throw new Error("Live trading through Codex is intentionally not implemented yet; use npm run trade or Claude Code after demo validation.");
      },
    );
  }

  return {
    list() {
      return [...toolDefs.values()];
    },
    async call(name, args = {}) {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Unknown Codex bridge tool: ${name}`);
      return handler(args);
    },
  };
}
