import "dotenv/config";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DerivClient } from "../src/derivClient.js";
import { normalizeSyntheticSymbol } from "../src/symbols.js";
import {
  formatDerivActiveSymbols,
  getResearchSymbolCatalog,
  normalizeDerivResearchSymbol,
  resolveResearchSymbol,
  toTradingViewSymbol,
} from "../src/derivSymbolRegistry.js";
import {
  backtestCandidateSet,
  buildAutonomyPlan,
  buildAutonomyStatus,
  generateStrategyCandidates,
  loadCandlePayload,
  rankBacktestResults,
} from "../src/strategyAutonomy.js";
import {
  analyzeChartCandles,
  buildCommandCenter,
  buildMorningBriefPlan,
  buildTradeDeskChecklist,
  scanWatchlist,
} from "../src/tradingJarvis.js";
import { buildRuntimeHealthReport } from "../src/runtimeHealth.js";
import { validateDerivTradeSize } from "../src/tradeConstraints.js";

export { normalizeSyntheticSymbol };

export function normalizeTradingViewSyntheticSymbol(symbol) {
  return toTradingViewSymbol(symbol);
}

export function parseStrategyTesterSummaryText(text = "") {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const summary = {
    hasSummary: /Total P&L/i.test(normalized) || /Total trades/i.test(normalized),
    invalidData: /INVALID DATA/i.test(normalized),
    metrics: {},
    rawText: normalized.slice(0, 4000),
  };

  const totalPnl = normalized.match(/Total P&L\s+(-?[\d,]+(?:\.\d+)?)\s+([A-Z]{3})\s+(-?[\d,.]+%)/i);
  if (totalPnl) {
    summary.metrics.totalPnl = Number(totalPnl[1].replace(/,/g, ""));
    summary.metrics.totalPnlCurrency = totalPnl[2].toUpperCase();
    summary.metrics.totalPnlPercent = totalPnl[3];
  }

  const maxDrawdown = normalized.match(/Max equity drawdown\s+(-?[\d,]+(?:\.\d+)?)\s+([A-Z]{3})\s+(-?[\d,.]+%)/i);
  if (maxDrawdown) {
    summary.metrics.maxEquityDrawdown = Number(maxDrawdown[1].replace(/,/g, ""));
    summary.metrics.maxEquityDrawdownCurrency = maxDrawdown[2].toUpperCase();
    summary.metrics.maxEquityDrawdownPercent = maxDrawdown[3];
  }

  const totalTrades = normalized.match(/Total trades\s+([\d,]+)/i);
  if (totalTrades) summary.metrics.totalTrades = Number(totalTrades[1].replace(/,/g, ""));

  const profitableTrades = normalized.match(/Profitable trades\s+([^\s]+)/i);
  if (profitableTrades) summary.metrics.profitableTrades = profitableTrades[1];

  const profitFactor = normalized.match(/Profit factor\s+([^\s]+)/i);
  if (profitFactor) summary.metrics.profitFactor = profitFactor[1];

  return summary;
}

export function buildSavedPineStrategyAttachmentResult({
  name,
  before = [],
  after = [],
  strategyTester = null,
} = {}) {
  if (!name || typeof name !== "string") throw new Error("name is required.");
  const needle = name.toLowerCase();
  const exactStudyMatch = after.some(item => `${item.name} ${item.title} ${item.rowText}`.toLowerCase().includes(needle));
  const countIncreased = after.length > before.length;
  const attachmentEvidence = { exactStudyMatch, countIncreased };
  const result = {
    attached: exactStudyMatch,
    name,
    beforeCount: before.length,
    afterCount: after.length,
    attachmentEvidence,
    studies: after,
  };

  if (strategyTester) {
    result.strategyTester = strategyTester;
    attachmentEvidence.strategyTesterSummary = Boolean(strategyTester.hasSummary);
  }

  if (!exactStudyMatch && (countIncreased || strategyTester?.hasSummary)) {
    attachmentEvidence.mismatchReason = "visible evidence did not include the exact saved Pine strategy name";
  }

  return result;
}

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

function positiveEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function errorMessage(error) {
  return error?.message || String(error);
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const EXTERNAL_TRADINGVIEW_MCP_PATH = process.env.CODEX_TRADINGVIEW_MCP_SERVER
  || "C:/Users/NewAdmin/tradingview-mcp/src/server.js";

const EXTERNAL_TRADINGVIEW_TOOL_NAMES = [
  "tv_health_check",
  "tv_discover",
  "tv_ui_state",
  "tv_launch",
  "chart_get_state",
  "chart_set_symbol",
  "chart_set_timeframe",
  "chart_set_type",
  "chart_manage_indicator",
  "chart_get_visible_range",
  "chart_set_visible_range",
  "chart_scroll_to_date",
  "symbol_info",
  "symbol_search",
  "pine_get_source",
  "pine_set_source",
  "pine_compile",
  "pine_get_errors",
  "pine_save",
  "pine_get_console",
  "pine_smart_compile",
  "pine_new",
  "pine_open",
  "pine_list_scripts",
  "pine_analyze",
  "pine_check",
  "data_get_ohlcv",
  "data_get_indicator",
  "data_get_strategy_results",
  "data_get_trades",
  "data_get_equity",
  "quote_get",
  "depth_get",
  "data_get_pine_lines",
  "data_get_pine_labels",
  "data_get_pine_tables",
  "data_get_pine_boxes",
  "data_get_study_values",
  "capture_screenshot",
  "draw_shape",
  "draw_list",
  "draw_clear",
  "draw_remove_one",
  "draw_get_properties",
  "alert_create",
  "alert_list",
  "alert_delete",
  "batch_run",
  "replay_start",
  "replay_step",
  "replay_autoplay",
  "replay_stop",
  "replay_trade",
  "replay_status",
  "indicator_set_inputs",
  "indicator_toggle_visibility",
  "watchlist_get",
  "watchlist_add",
  "ui_click",
  "ui_open_panel",
  "ui_fullscreen",
  "layout_list",
  "layout_switch",
  "ui_keyboard",
  "ui_type_text",
  "ui_hover",
  "ui_scroll",
  "ui_mouse_click",
  "ui_find_element",
  "ui_evaluate",
  "pane_list",
  "pane_set_layout",
  "pane_focus",
  "pane_set_symbol",
  "tab_list",
  "tab_new",
  "tab_close",
  "tab_switch",
  "morning_brief",
  "session_save",
  "session_get",
];

function defaultExternalTradingViewTools() {
  if (!existsSync(EXTERNAL_TRADINGVIEW_MCP_PATH)) return [];
  return EXTERNAL_TRADINGVIEW_TOOL_NAMES.map(name => ({
    name,
    description: `Proxy to local tradingview-mcp tool ${name}.`,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
  }));
}

function parseMcpTextContent(result) {
  const text = result?.content
    ?.filter(item => item.type === "text")
    .map(item => item.text)
    .join("\n");
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function defaultExternalTradingViewCaller(name, args = {}) {
  if (!existsSync(EXTERNAL_TRADINGVIEW_MCP_PATH)) {
    throw new Error(`External TradingView MCP server not found: ${EXTERNAL_TRADINGVIEW_MCP_PATH}`);
  }
  const client = new Client({ name: "codex-tradingview-proxy", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [EXTERNAL_TRADINGVIEW_MCP_PATH],
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });
    const parsed = parseMcpTextContent(result);
    if (result.isError) {
      const message = typeof parsed === "string" ? parsed : parsed?.error || JSON.stringify(parsed);
      throw new Error(message);
    }
    return parsed;
  } finally {
    await client.close();
  }
}

function defaultTvClient() {
  const baseUrl = process.env.TRADINGVIEW_CDP_URL || "http://127.0.0.1:9222";
  const screenshotDir = process.env.CODEX_TV_SCREENSHOT_DIR || "state";
  const cdpCommandTimeoutMs = positiveEnvNumber("CODEX_TV_CDP_COMMAND_TIMEOUT_MS", 10000);

  function toTradingViewSymbol(symbol) {
    return normalizeTradingViewSyntheticSymbol(symbol);
  }

  function resolveScreenshotPath(requestedPath) {
    const target = requestedPath || path.join(screenshotDir, `tradingview-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    return path.resolve(process.cwd(), target);
  }

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
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`TradingView CDP websocket open timed out after ${cdpCommandTimeoutMs}ms`));
      }, cdpCommandTimeoutMs);
      ws.on("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.on("error", error => {
        clearTimeout(timer);
        reject(error);
      });
    });
    ws.on("message", raw => {
      const msg = JSON.parse(raw);
      if (!pending.has(msg.id)) return;
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const messageId = ++id;
      const timer = setTimeout(() => {
        pending.delete(messageId);
        reject(new Error(`TradingView CDP ${method} timed out after ${cdpCommandTimeoutMs}ms`));
      }, cdpCommandTimeoutMs);
      pending.set(messageId, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "TradingView evaluation failed");
      }
      return result.result.value;
    };
    const navigate = async (url) => {
      await send("Page.enable");
      await send("Page.navigate", { url });
    };
    const captureScreenshot = async () => {
      await send("Page.enable");
      const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      return result.data;
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
    const pressControlEnter = async () => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 2, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    };
    const insertText = async (text) => {
      await send("Input.insertText", { text });
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      await send("Runtime.enable");
      return await fn({ evaluate, navigate, captureScreenshot, click, pressEscape, pressControlA, pressControlEnter, insertText, wait });
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

  const listVisibleStudiesFromDom = `(() => {
    const rows = [...document.querySelectorAll('.item-l31H9iuA.study-l31H9iuA')]
      .map(row => {
        const rect = row.getBoundingClientRect();
        const title = row.querySelector('[title]')?.getAttribute('title')?.trim() || '';
        const rowText = (row.innerText || row.textContent || '').trim().replace(/\\s+/g, ' ');
        return { name: title || rowText, title, rowText, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    const legendButtons = [...document.querySelectorAll('button,[role="button"]')]
      .map(el => {
        const rect = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
        return { name: text, title: el.getAttribute('title') || '', rowText: text, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .filter(row => row.rowText && row.width > 40 && row.height > 10 && row.x < 700 && row.y > 40 && row.y < 220);
    const seen = new Set();
    return [...rows, ...legendButtons]
      .filter(row => row.rowText || row.title)
      .filter(row => {
        const key = row.name + "|" + row.rowText + "|" + Math.round(row.x) + "|" + Math.round(row.y);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })()`;

  const strategyTesterSummaryTextFromDom = `(() => {
    const visibleText = [...document.querySelectorAll('div,section,[role="tabpanel"],[data-name]')]
      .map(el => {
        const rect = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
        return { text, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .filter(item => item.text && item.width > 20 && item.height > 10)
      .filter(item => /Total P&L|Total trades|Profit factor|Max equity drawdown/i.test(item.text));
    return [...new Set(visibleText.map(item => item.text))].join("\\n").slice(0, 8000);
  })()`;

  const openIndicatorsButtonFromDom = `(() => {
    const buttons = [...document.querySelectorAll('button[data-name="open-indicators-dialog"], button')]
      .filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    const btn = buttons.find(b => b.getAttribute('data-name') === 'open-indicators-dialog' || /Indicators, metrics/i.test(b.getAttribute('aria-label') || ''));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`;

  const indicatorsDialogFromDom = `(() => {
    const dialog = [...document.querySelectorAll('[data-name="indicators-dialog"], [role="dialog"]')]
      .find(item => item.getAttribute('data-name') === 'indicators-dialog'
        || /Indicators, metrics, and strategies/i.test(item.innerText || item.textContent || ''));
    if (!dialog) return null;
    const r = dialog.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  })()`;

  const indicatorSearchInputFromDom = `(() => {
    const inputs = [...document.querySelectorAll('input')]
      .map(input => {
        const r = input.getBoundingClientRect();
        return {
          placeholder: input.placeholder || '',
          ariaLabel: input.getAttribute('aria-label') || '',
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          width: r.width,
          height: r.height,
          visible: r.width > 0 && r.height > 0,
        };
      })
      .filter(input => input.visible);
    return inputs.find(input => input.placeholder === 'Search')
      || inputs.find(input => /search/i.test(input.placeholder + ' ' + input.ariaLabel))
      || inputs.find(input => input.width > 100 && input.y < 240)
      || null;
  })()`;

  const notifyIndicatorSearchInputFromDom = `(() => {
    const input = [...document.querySelectorAll('[data-name="indicators-dialog"] input, [role="dialog"] input, input')]
      .find(item => {
        const r = item.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (item.placeholder === 'Search' || /search/i.test(item.placeholder || item.getAttribute('aria-label') || ''));
      });
    if (!input) return null;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value;
  })()`;

  const myScriptsTabFromDom = `(() => {
    const dialog = document.querySelector('[data-name="indicators-dialog"], [role="dialog"]') || document;
    const candidates = [...dialog.querySelectorAll('button,div,[role=tab],[role=button]')]
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
        return { text, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
      })
      .filter(item => item.visible && item.text === 'My scripts' && item.w > 50);
    return candidates.sort((a, b) => b.w - a.w)[0] || null;
  })()`;

  async function openIndicatorsDialogIfNeeded(evaluate, click, wait) {
    const dialog = await evaluate(indicatorsDialogFromDom);
    if (dialog) return dialog;
    const openButton = await waitForDomResult(evaluate, wait, openIndicatorsButtonFromDom, "TradingView Indicators button", { attempts: 8 });
    await click(openButton.x, openButton.y);
    await wait(800);
    return waitForDomResult(evaluate, wait, indicatorsDialogFromDom, "TradingView Indicators dialog", { attempts: 12, delayMs: 250 });
  }

  async function refreshIndicatorSearch(evaluate, wait) {
    await evaluate(notifyIndicatorSearchInputFromDom);
    await wait(1100);
  }

  async function waitForDomResult(evaluate, wait, expression, description, { attempts = 24, delayMs = 250 } = {}) {
    let last = null;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        last = await evaluate(expression);
        lastError = null;
      } catch (error) {
        last = null;
        lastError = error;
      }
      if (last && (!Array.isArray(last) || last.length > 0)) return last;
      await wait(delayMs);
    }
    const suffix = lastError ? ` Last error: ${errorMessage(lastError)}` : "";
    throw new Error(`${description} not found.${suffix}`);
  }

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
        await openIndicatorsDialogIfNeeded(evaluate, click, wait);

        const search = await waitForDomResult(evaluate, wait, indicatorSearchInputFromDom, "TradingView indicator search input");
        await click(search.x, search.y);
        await pressControlA();
        await insertText(name);
        await refreshIndicatorSearch(evaluate, wait);

        const row = await waitForDomResult(evaluate, wait, `(() => {
          const target = ${JSON.stringify(name)};
          const rows = [...document.querySelectorAll('div,button,[role=option]')].map(el => {
            const r = el.getBoundingClientRect();
            const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
            return { text, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
          }).filter(x => x.visible && x.text === target && x.w > 100);
          return rows[0] || null;
        })()`, `Indicator result: ${name}`, { attempts: 16, delayMs: 300 });
        await click(row.x + Math.min(row.w - 20, 220), row.y + row.h / 2);
        await wait(1200);
        await pressEscape();
        await wait(300);

        const after = await evaluate(listIndicatorsFromDom);
        return { added: true, name, beforeCount: before.length, afterCount: after.length, indicators: after };
      });
    },
    async attachSavedPineStrategy({ name, readSummary = true } = {}) {
      if (!name || typeof name !== "string") throw new Error("name is required.");
      return withChartPage(async ({ evaluate, click, pressControlA, insertText, pressEscape, wait }) => {
        const before = await evaluate(listVisibleStudiesFromDom);
        await openIndicatorsDialogIfNeeded(evaluate, click, wait);

        const myScriptsTab = await waitForDomResult(evaluate, wait, myScriptsTabFromDom, "TradingView My scripts tab", { attempts: 12, delayMs: 250 });
        await click(myScriptsTab.x + Math.min(myScriptsTab.w - 12, 120), myScriptsTab.y + myScriptsTab.h / 2);
        await wait(500);

        const search = await waitForDomResult(evaluate, wait, indicatorSearchInputFromDom, "TradingView indicator search input");
        await click(search.x, search.y);
        await pressControlA();
        await insertText(name);
        await refreshIndicatorSearch(evaluate, wait);

        const row = await waitForDomResult(evaluate, wait, `(() => {
          const target = ${JSON.stringify(name.toLowerCase())};
          const candidates = [...document.querySelectorAll('[data-name="indicators-dialog"] span, [data-name="indicators-dialog"] div, [role="dialog"] span, [role="dialog"] div')]
            .map(el => {
              const r = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
              return { text, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
            })
            .filter(item => item.visible && item.text.toLowerCase() === target && item.w > 40);
          return candidates[0] || null;
        })()`, `Saved Pine strategy result: ${name}`, { attempts: 16, delayMs: 300 });
        await click(row.x + Math.min(row.w - 8, 160), row.y + row.h / 2);
        await wait(1500);
        await pressEscape();
        await wait(500);

        const after = await evaluate(listVisibleStudiesFromDom);
        let strategyTester = null;
        if (readSummary) {
          const rawText = await evaluate(strategyTesterSummaryTextFromDom);
          strategyTester = parseStrategyTesterSummaryText(rawText);
        }
        return buildSavedPineStrategyAttachmentResult({
          name,
          before,
          after,
          strategyTester,
        });
      });
    },
    async readStrategyTesterSummary() {
      return withChartPage(async ({ evaluate }) => {
        const rawText = await evaluate(strategyTesterSummaryTextFromDom);
        return parseStrategyTesterSummaryText(rawText);
      });
    },
    async cleanChartStudies({ keepNames = ["Relative Strength Index", "RSI"], ensureRsi = true } = {}) {
      const keep = new Set((Array.isArray(keepNames) ? keepNames : [keepNames])
        .filter(Boolean)
        .flatMap(item => [String(item).toLowerCase(), String(item).replace(/^Relative Strength Index$/i, "RSI").toLowerCase()]));

      return withChartPage(async ({ evaluate, click, pressControlA, insertText, pressEscape, wait }) => {
        await pressEscape();
        await wait(250);
        const before = await evaluate(listIndicatorsFromDom);
        const removed = [];
        const shouldKeep = row => {
          const haystack = `${row.name || ""} ${row.title || ""} ${row.rowText || ""}`.toLowerCase();
          return [...keep].some(item => item && haystack.includes(item));
        };

        for (let attempt = 0; attempt < 12; attempt++) {
          const rows = await evaluate(`(() => [...document.querySelectorAll('.item-l31H9iuA.study-l31H9iuA')]
            .map(row => {
              const rr = row.getBoundingClientRect();
              const title = row.querySelector('[title]')?.getAttribute('title')?.trim() || '';
              const rowText = (row.innerText || row.textContent || '').trim().replace(/\\s+/g, ' ');
              const btn = [...row.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Remove' || b.title === 'Remove');
              const br = btn?.getBoundingClientRect();
              return {
                name: rowText.split(/\\s+/)[0] || title || rowText,
                title,
                rowText,
                rowX: rr.x,
                rowY: rr.y,
                rowW: rr.width,
                rowH: rr.height,
                removeX: br ? br.x + br.width / 2 : null,
                removeY: br ? br.y + br.height / 2 : null
              };
            })
            .filter(row => row.rowText || row.title))()`);
          const row = rows.find(item => !shouldKeep(item));
          if (!row) break;
          await click(row.rowX + 20, row.rowY + row.rowH / 2);
          await wait(120);
          await click(row.removeX || row.rowX + Math.max(28, row.rowW - 30), row.removeY || row.rowY + row.rowH / 2);
          removed.push({ name: row.name, title: row.title, rowText: row.rowText });
          await wait(650);
        }

        let after = await evaluate(listIndicatorsFromDom);
        const hasRsi = after.some(row => /(^|\s)RSI(\s|$)|Relative Strength Index/i.test(`${row.name || ""} ${row.title || ""} ${row.rowText || ""}`));
        let rsiAdded = false;
        if (ensureRsi && !hasRsi) {
          await openIndicatorsDialogIfNeeded(evaluate, click, wait);

          const search = await waitForDomResult(evaluate, wait, indicatorSearchInputFromDom, "TradingView indicator search input");
          await click(search.x, search.y);
          await pressControlA();
          await insertText("Relative Strength Index");
          await refreshIndicatorSearch(evaluate, wait);

          const row = await waitForDomResult(evaluate, wait, `(() => {
            const rows = [...document.querySelectorAll('div,button,[role=option]')].map(el => {
              const r = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
              return { text, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
            }).filter(x => x.visible && x.text === "Relative Strength Index" && x.w > 100);
            return rows[0] || null;
          })()`, "Relative Strength Index result", { attempts: 16, delayMs: 300 });
          await click(row.x + Math.min(row.w - 20, 220), row.y + row.h / 2);
          await wait(1200);
          await pressEscape();
          await wait(300);
          rsiAdded = true;
          after = await evaluate(listIndicatorsFromDom);
        }

        return { cleaned: true, keepNames: [...keep], before, after, removed, rsiAdded };
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
    async setChart({ symbol, timeframe = "15" } = {}) {
      if (!symbol) throw new Error("symbol is required.");
      const resolved = resolveResearchSymbol(symbol);
      const normalizedSymbol = resolved.derivSymbol;
      const tvSymbol = toTradingViewSymbol(normalizedSymbol);
      return withChartPage(async ({ evaluate, navigate, wait }) => {
        const beforeUrl = await evaluate("location.href");
        const nextUrl = await evaluate(`(() => {
          const url = new URL(location.href);
          url.searchParams.set("symbol", ${JSON.stringify(tvSymbol)});
          url.searchParams.set("interval", ${JSON.stringify(String(timeframe))});
          return url.toString();
        })()`);
        await navigate(nextUrl);
        await wait(1000);
        await waitForDomResult(evaluate, wait, `(() => {
          const expectedSymbol = ${JSON.stringify(tvSymbol.replace(/^DERIV:/, ""))};
          const visibleText = (document.body?.innerText || document.body?.textContent || '').replace(/\\s+/g, ' ');
          const buttons = [...document.querySelectorAll('button')].map(button => button.getAttribute('aria-label') || button.innerText || button.textContent || '').join(' ');
          const url = location.href;
          const hasChartChrome = /Indicators|Chart interval|Compare symbols/i.test(buttons + ' ' + visibleText);
          const hasSymbol = visibleText.includes(expectedSymbol) || url.includes(encodeURIComponent(${JSON.stringify(tvSymbol)}));
          return hasChartChrome && hasSymbol ? { ready: true } : null;
        })()`, "TradingView chart after navigation", { attempts: 36, delayMs: 500 });
        const afterUrl = await evaluate("location.href");
        return {
          symbol: normalizedSymbol,
          operatorSymbol: resolved.symbol,
          tradingViewSymbol: tvSymbol,
          executionEligible: resolved.executionSupported,
          timeframe: String(timeframe),
          beforeUrl,
          afterUrl,
        };
      });
    },
    async injectPineSource({ source, compile = true } = {}) {
      if (!source || typeof source !== "string") throw new Error("source is required.");
      return withChartPage(async ({ evaluate, click, pressControlA, pressControlEnter, insertText, wait }) => {
        const editor = await evaluate(`(() => {
          const candidates = [
            ...document.querySelectorAll('textarea.inputarea, textarea, [contenteditable="true"], .monaco-editor textarea')
          ].map(el => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 24), width: r.width, height: r.height, visible: r.width > 0 && r.height > 0 };
          }).filter(x => x.visible);
          return candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
        })()`);
        if (!editor) throw new Error("Pine editor input not found. Open the Pine Editor panel in TradingView first.");
        await click(editor.x, editor.y);
        await wait(100);
        await pressControlA();
        await insertText(source);
        await wait(400);
        if (compile) {
          await pressControlEnter();
          await wait(1800);
        }
        return { injected: true, compiled: Boolean(compile), sourceLength: source.length };
      });
    },
    async getPineErrors() {
      return withChartPage(async ({ evaluate }) => {
        const result = await evaluate(`(() => {
          const rows = [...document.querySelectorAll('[role="alert"], [class*="error" i], [data-name*="error" i], .tv-dialog, .bottom-widgetbar-content, .pine-editor, body')]
            .map(el => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' '))
            .filter(Boolean);
          const messages = [...new Set(rows.flatMap(text => {
            const matches = text.match(/(?:line\\s+\\d+[^.]*|syntax error[^.]*|cannot compile[^.]*|error[^.]{0,180})/ig);
            return matches || [];
          }).map(x => x.trim()))];
          return { errors: messages, rawText: rows.slice(0, 20).join("\\n").slice(0, 8000) };
        })()`);
        return { hasErrors: result.errors.length > 0, errors: result.errors, rawText: result.rawText };
      });
    },
    async captureScreenshot({ path: requestedPath } = {}) {
      return withChartPage(async ({ captureScreenshot }) => {
        const data = await captureScreenshot();
        const outputPath = resolveScreenshotPath(requestedPath);
        const parent = path.dirname(outputPath);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        const bytes = Buffer.byteLength(data, "base64");
        writeFileSync(outputPath, Buffer.from(data, "base64"));
        return { path: outputPath, bytes, mimeType: "image/png" };
      });
    },
  };
}

function defaultDerivClientFactory({ requireToken = true } = {}) {
  const apiToken = process.env.DERIV_API_TOKEN;
  if (requireToken && (!apiToken || apiToken === "your_deriv_token_here" || apiToken === "your_token_here")) {
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
  externalTradingViewTools = defaultExternalTradingViewTools(),
  externalTradingViewCaller = defaultExternalTradingViewCaller,
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
  const hasTool = name => toolDefs.has(name);
  const externalToolNames = new Set(externalTradingViewTools.map(tool => tool?.name).filter(Boolean));
  const canManageChartStudiesExternally = externalToolNames.has("chart_get_state") && externalToolNames.has("chart_manage_indicator");
  const openStrategyTesterPanel = async () => {
    if (typeof tvClient.openStrategyTesterPanel === "function") {
      return tvClient.openStrategyTesterPanel();
    }
    if (externalToolNames.has("ui_open_panel")) {
      return externalTradingViewCaller("ui_open_panel", {
        panel: "strategy-tester",
        action: "open",
      });
    }
    return {
      opened: false,
      skipped: true,
      reason: "No Strategy Tester panel opener is available.",
    };
  };
  const cleanChartStudies = async ({ keepNames = ["Relative Strength Index", "RSI"], ensureRsi = true } = {}) => {
    const keep = (Array.isArray(keepNames) ? keepNames : [keepNames])
      .filter(Boolean)
      .map(item => String(item).toLowerCase());
    const shouldKeep = study => {
      const haystack = `${study?.name || ""} ${study?.title || ""} ${study?.rowText || ""}`.toLowerCase();
      return keep.some(item => item && haystack.includes(item));
    };

    let localCleanupError = null;
    if (typeof tvClient.cleanChartStudies === "function") {
      try {
        const result = await tvClient.cleanChartStudies({ keepNames, ensureRsi });
        return { ...result, source: result?.source || "local_dom" };
      } catch (error) {
        localCleanupError = error;
        if (!canManageChartStudiesExternally) throw error;
      }
    }

    if (canManageChartStudiesExternally) {
      const beforeState = await externalTradingViewCaller("chart_get_state", {});
      const before = Array.isArray(beforeState?.studies) ? beforeState.studies : [];
      const removed = [];
      for (const study of before) {
        if (shouldKeep(study)) continue;
        await externalTradingViewCaller("chart_manage_indicator", {
          action: "remove",
          indicator: study.name || study.title || "study",
          entity_id: study.id,
        });
        removed.push(study);
      }
      let afterState = await externalTradingViewCaller("chart_get_state", {});
      let after = Array.isArray(afterState?.studies) ? afterState.studies : [];
      const hasRsi = after.some(study => /Relative Strength Index|(^|\s)RSI(\s|$)/i.test(`${study.name || ""} ${study.title || ""}`));
      let rsiAdded = false;
      if (ensureRsi && !hasRsi) {
        await externalTradingViewCaller("chart_manage_indicator", {
          action: "add",
          indicator: "Relative Strength Index",
          inputs: "{\"length\":14}",
        });
        rsiAdded = true;
        afterState = await externalTradingViewCaller("chart_get_state", {});
        after = Array.isArray(afterState?.studies) ? afterState.studies : [];
      }
      return {
        cleaned: true,
        source: "external_chart_api",
        keepNames,
        before,
        after,
        removed,
        rsiAdded,
        fallbackReason: localCleanupError ? localCleanupError.message : undefined,
      };
    }

    return tvClient.cleanChartStudies({ keepNames, ensureRsi });
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
    "tv_clean_chart_studies",
    textSchema(
      "Remove chart studies except an allow-list and optionally ensure RSI is present.",
      {
        keepNames: {
          type: "array",
          items: { type: "string" },
          default: ["Relative Strength Index", "RSI"],
          description: "Study names or aliases to keep. Defaults to RSI only.",
        },
        ensureRsi: { type: "boolean", default: true },
      },
    ),
    async (args) => cleanChartStudies({
      keepNames: args.keepNames || ["Relative Strength Index", "RSI"],
      ensureRsi: args.ensureRsi !== false,
    }),
  );

  addTool(
    "tv_set_chart",
    textSchema(
      "Set the active TradingView chart symbol and timeframe for execution-supported V75/V50 symbols.",
      {
        symbol: { type: "string", enum: ["VOLATILITY_75", "VOLATILITY_50", "R_75", "R_50"] },
        timeframe: { type: "string", default: "15", description: "TradingView interval such as 1, 5, 15, 60, 240, or D." },
      },
      ["symbol"],
    ),
    async (args) => {
      const normalized = normalizeSyntheticSymbol(args.symbol);
      const resolved = resolveResearchSymbol(normalized);
      return tvClient.setChart({
        ...args,
        symbol: normalized,
        operatorSymbol: resolved.symbol,
        tradingViewSymbol: resolved.tradingViewSymbol,
        timeframe: String(args.timeframe || "15"),
      });
    },
  );

  addTool(
    "tv_research_set_chart",
    textSchema(
      "Set the active TradingView chart symbol and timeframe for any known Deriv derived/synthetic research symbol. This does not make the symbol execution-eligible.",
      {
        symbol: { type: "string", description: "Deriv research symbol alias, Deriv API symbol, display name, or DERIV: TradingView symbol." },
        timeframe: { type: "string", default: "15", description: "TradingView interval such as 1, 5, 15, 60, 240, or D." },
      },
      ["symbol"],
    ),
    async (args) => {
      const resolved = resolveResearchSymbol(args.symbol);
      return tvClient.setChart({
        ...args,
        symbol: resolved.derivSymbol,
        operatorSymbol: resolved.symbol,
        tradingViewSymbol: resolved.tradingViewSymbol,
        executionEligible: resolved.executionSupported,
        timeframe: String(args.timeframe || "15"),
      });
    },
  );

  addTool(
    "tv_inject_pine_source",
    textSchema(
      "Replace Pine Editor contents with provided source and optionally trigger TradingView compile with Ctrl+Enter.",
      {
        source: { type: "string" },
        compile: { type: "boolean", default: true },
      },
      ["source"],
    ),
    async (args) => tvClient.injectPineSource({ source: args.source, compile: args.compile !== false }),
  );

  addTool(
    "tv_attach_saved_pine_strategy",
    textSchema(
      "Search TradingView's Indicators dialog for a saved Pine strategy, add it to the chart, and optionally read visible Strategy Tester summary metrics.",
      {
        name: { type: "string", description: "Exact saved Pine script name, for example Breakout Retest V1." },
        readSummary: { type: "boolean", default: true },
      },
      ["name"],
    ),
    async (args) => tvClient.attachSavedPineStrategy({
      name: args.name,
      readSummary: args.readSummary !== false,
    }),
  );

  addTool(
    "tv_read_strategy_tester_summary",
    textSchema("Read visible TradingView Strategy Tester summary metrics from the current chart."),
    async () => tvClient.readStrategyTesterSummary(),
  );

  addTool(
    "tv_backtest_workflow_check",
    textSchema(
      "Prepare a TradingView chart for backtesting, attach a saved Pine strategy, and verify visible Strategy Tester summary metrics.",
      {
        symbol: { type: "string", enum: ["VOLATILITY_75", "VOLATILITY_50", "R_75", "R_50"], default: "VOLATILITY_75" },
        timeframe: { type: "string", default: "15" },
        strategyName: { type: "string", default: "Breakout Retest V1" },
        keepNames: {
          type: "array",
          items: { type: "string" },
          default: ["Relative Strength Index", "RSI"],
        },
      },
    ),
    async (args) => {
      const stepTimeoutMs = positiveEnvNumber("CODEX_TV_BACKTEST_STEP_TIMEOUT_MS", 45000);
      const runStep = async (name, fn) => {
        try {
          return { ok: true, value: await withTimeout(fn(), stepTimeoutMs, name) };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      };
      const chartStep = await runStep("set TradingView chart", () => handlers.get("tv_set_chart")({
        symbol: args.symbol || "VOLATILITY_75",
        timeframe: String(args.timeframe || "15"),
      }));
      const cleanupStep = chartStep.ok
        ? await runStep("clean TradingView chart studies", () => cleanChartStudies({
          keepNames: args.keepNames || ["Relative Strength Index", "RSI"],
          ensureRsi: true,
        }))
        : { ok: false, error: "Skipped because chart setup failed." };
      const strategyStep = cleanupStep.ok
        ? await runStep("attach saved Pine strategy", () => tvClient.attachSavedPineStrategy({
          name: args.strategyName || "Breakout Retest V1",
          readSummary: true,
        }))
        : { ok: false, error: "Skipped because chart cleanup failed." };
      const panelStep = strategyStep.ok && !strategyStep.value?.strategyTester?.hasSummary
        ? await runStep("open Strategy Tester panel", () => openStrategyTesterPanel())
        : { ok: true, value: { skipped: true } };
      const summaryStep = !strategyStep.ok
        ? { ok: false, error: "Skipped because saved Pine strategy attach failed." }
        : strategyStep.value?.strategyTester?.hasSummary
          ? { ok: true, value: strategyStep.value.strategyTester }
          : await runStep("read Strategy Tester summary", () => tvClient.readStrategyTesterSummary());
      const chart = chartStep.value || null;
      const cleanup = cleanupStep.value || null;
      const strategy = strategyStep.value || {
        attached: false,
        name: args.strategyName || "Breakout Retest V1",
        error: strategyStep.error,
      };
      const summary = summaryStep.value || {
        hasSummary: false,
        metrics: {},
        error: summaryStep.error,
      };
      const blockers = [];
      if (!chartStep.ok) blockers.push(`Chart setup failed: ${chartStep.error}`);
      if (!cleanupStep.ok) blockers.push(`Chart cleanup failed: ${cleanupStep.error}`);
      if (!strategyStep.ok) blockers.push(`Saved Pine strategy attach failed: ${strategyStep.error}`);
      if (!panelStep.ok && !summary.hasSummary) blockers.push(`Strategy Tester panel open failed: ${panelStep.error}`);
      if (!summaryStep.ok) blockers.push(`Strategy Tester summary read failed: ${summaryStep.error}`);
      if (!strategy.attached) blockers.push("Saved Pine strategy did not attach to the chart.");
      if (!summary.hasSummary) blockers.push("Strategy Tester summary metrics were not visible/readable.");
      if (summary.invalidData) blockers.push("Strategy Tester reported INVALID DATA.");
      if (summary.metrics?.totalTrades === 0) blockers.push("Strategy Tester reported zero total trades.");
      return {
        ok: blockers.length === 0,
        blockers,
        stepTimeoutMs,
        chart,
        cleanup,
        strategy,
        strategyTesterPanel: panelStep.value || null,
        summary,
      };
    },
  );

  addTool(
    "tv_get_pine_errors",
    textSchema("Read visible Pine compile/error messages from the active TradingView chart page."),
    async () => tvClient.getPineErrors(),
  );

  addTool(
    "tv_capture_screenshot",
    textSchema(
      "Capture a PNG screenshot of the active TradingView chart page through CDP.",
      { path: { type: "string", description: "Optional local output path. Defaults under state/." } },
    ),
    async (args) => tvClient.captureScreenshot(args),
  );

  for (const tool of externalTradingViewTools) {
    if (!tool?.name || hasTool(tool.name)) continue;
    addTool(
      tool.name,
      {
        description: tool.description || `Proxy to local tradingview-mcp tool ${tool.name}.`,
        inputSchema: tool.inputSchema || {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
      },
      async (args) => externalTradingViewCaller(tool.name, args),
    );
  }

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
    "deriv_active_symbols",
    textSchema(
      "List current Deriv derived/synthetic research symbols with Codex aliases and TradingView chart names. This is read-only.",
      {
        live: { type: "boolean", default: true, description: "When true, fetch Deriv active_symbols; when false, return the repo fallback catalogue." },
      },
    ),
    async (args) => {
      if (args.live === false) {
        return { source: "repo-fallback", symbols: getResearchSymbolCatalog() };
      }
      const client = derivClientFactory({ requireToken: false });
      try {
        if (client.connect) await client.connect();
        const raw = client.activeSymbols
          ? await client.activeSymbols({ productType: "basic" })
          : [];
        const formatted = raw.length ? formatDerivActiveSymbols(raw) : getResearchSymbolCatalog();
        return { source: raw.length ? "deriv-active_symbols" : "repo-fallback", symbols: formatted };
      } finally {
        client.close?.();
      }
    },
  );

  addTool(
    "deriv_candles",
    textSchema(
      "Fetch Deriv candles for execution-supported V75/V50 symbols. This is read-only and does not place orders.",
      {
        symbol: { type: "string", enum: ["VOLATILITY_75", "VOLATILITY_50", "R_75", "R_50"] },
        granularity: { type: "number", default: 900 },
        count: { type: "number", default: 100 },
      },
      ["symbol"],
    ),
    async (args) => {
      const normalized = normalizeSyntheticSymbol(args.symbol);
      const resolved = resolveResearchSymbol(normalized);
      const client = derivClientFactory();
      try {
        if (client.connect) await client.connect();
        if (client.authorize) await client.authorize();
        const candles = await client.candles({
          symbol: normalized,
          granularity: args.granularity || 900,
          count: args.count || 100,
        });
        return {
          symbol: resolved.derivSymbol,
          operatorSymbol: resolved.symbol,
          tradingViewSymbol: resolved.tradingViewSymbol,
          candles,
        };
      } finally {
        client.close?.();
      }
    },
  );

  addTool(
    "deriv_research_candles",
    textSchema(
      "Fetch Deriv candles for any known Deriv derived/synthetic research symbol. This is read-only and does not place orders.",
      {
        symbol: { type: "string", description: "Deriv research symbol alias, Deriv API symbol, display name, or DERIV: TradingView symbol." },
        granularity: { type: "number", default: 900 },
        count: { type: "number", default: 100 },
      },
      ["symbol"],
    ),
    async (args) => {
      const client = derivClientFactory({ requireToken: false });
      try {
        if (client.connect) await client.connect();
        const resolved = resolveResearchSymbol(args.symbol);
        const candles = await client.candles({
          symbol: normalizeDerivResearchSymbol(args.symbol),
          granularity: args.granularity || 900,
          count: args.count || 100,
        });
        return {
          symbol: resolved.derivSymbol,
          operatorSymbol: resolved.symbol,
          tradingViewSymbol: resolved.tradingViewSymbol,
          executionEligible: resolved.executionSupported,
          candles,
        };
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

  addTool(
    "strategy_autonomy_status",
    textSchema("Return Codex Autonomy Lab capabilities and safety boundaries. This never places orders."),
    async () => buildAutonomyStatus(),
  );

  addTool(
    "strategy_autonomy_plan",
    textSchema(
      "Build a research-only mission plan for Codex to research, test, and backtest candidate strategies without execution approval.",
      {
        objective: { type: "string", default: "research and rank new strategy candidates" },
        symbols: { type: "array", items: { type: "string" }, default: ["VOLATILITY_75", "VOLATILITY_50"] },
        candleCount: { type: "number", default: 500 },
        granularity: { type: "number", default: 900 },
      },
    ),
    async (args) => buildAutonomyPlan({
      objective: args.objective || "research and rank new strategy candidates",
      symbols: Array.isArray(args.symbols) && args.symbols.length ? args.symbols : ["VOLATILITY_75", "VOLATILITY_50"],
      candleCount: args.candleCount || 500,
      granularity: args.granularity || 900,
    }),
  );

  addTool(
    "strategy_candidate_backtest",
    textSchema(
      "Run local research-only candidate strategy backtests from inline candles or an ignored research candle JSON file. Results do not approve execution.",
      {
        symbol: { type: "string", default: "VOLATILITY_75" },
        candleFile: { type: "string", description: "Optional repo-local JSON file from state/research/candles." },
        candles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              epoch: { type: "number" },
              open: { type: "number" },
              high: { type: "number" },
              low: { type: "number" },
              close: { type: "number" },
            },
            required: ["open", "high", "low", "close"],
            additionalProperties: true,
          },
        },
      },
    ),
    async (args) => {
      let candles = args.candles;
      let symbol = args.symbol || "VOLATILITY_75";
      let source = "inline";
      if ((!Array.isArray(candles) || !candles.length) && args.candleFile) {
        const payload = loadCandlePayload(args.candleFile);
        candles = payload.candles;
        symbol = args.symbol || payload.symbol || symbol;
        source = args.candleFile;
      }
      const candidates = generateStrategyCandidates({ symbol });
      const results = rankBacktestResults(backtestCandidateSet({ candles, candidates }));
      return {
        mode: "research_only",
        symbol,
        source,
        results,
        executionApproved: false,
        promotionRequired: true,
      };
    },
  );

  addTool(
    "jarvis_command_center",
    textSchema(
      "Build a Trading Jarvis command-center snapshot from chart state, indicators, screenshot, and optional account metadata.",
      {
        symbol: { type: "string", default: "VOLATILITY_75" },
        timeframe: { type: "string", default: "15" },
        includeScreenshot: { type: "boolean", default: false },
      },
    ),
    async (args) => {
      const chartState = tvClient.state ? await tvClient.state() : { targetCount: 0, targets: [] };
      const indicators = tvClient.listIndicators ? await tvClient.listIndicators() : [];
      const screenshot = args.includeScreenshot && tvClient.captureScreenshot
        ? await tvClient.captureScreenshot({})
        : null;
      return buildCommandCenter({
        chartState,
        indicators,
        screenshot,
        symbol: args.symbol || "VOLATILITY_75",
        timeframe: String(args.timeframe || "15"),
      });
    },
  );

  addTool(
    "jarvis_analyze_chart",
    textSchema(
      "Analyze candles into Trading Jarvis bias, setup state, invalidation, and next action. This never approves execution.",
      {
        symbol: { type: "string", default: "VOLATILITY_75" },
        timeframe: { type: "string", default: "15" },
        candles: { type: "array", items: { type: "object" } },
      },
      ["candles"],
    ),
    async (args) => analyzeChartCandles({
      symbol: args.symbol || "VOLATILITY_75",
      timeframe: String(args.timeframe || "15"),
      candles: args.candles || [],
    }),
  );

  addTool(
    "jarvis_scan_watchlist",
    textSchema(
      "Rank multiple symbols from supplied candle arrays while preserving research-vs-execution boundaries.",
      {
        timeframe: { type: "string", default: "15" },
        symbolCandles: { type: "object", additionalProperties: { type: "array", items: { type: "object" } } },
      },
      ["symbolCandles"],
    ),
    async (args) => scanWatchlist({
      symbolCandles: args.symbolCandles || {},
      timeframe: String(args.timeframe || "15"),
    }),
  );

  addTool(
    "jarvis_trade_desk_check",
    textSchema(
      "Run fail-closed Jarvis trade-desk gates before any explicit demo/live execution command.",
      {
        explicitExecutionRequest: { type: "boolean", default: false },
        account: { type: "object", additionalProperties: true },
        approval: { type: "object", additionalProperties: true },
        openPositions: { type: "array", items: { type: "object" } },
        env: { type: "object", additionalProperties: true },
      },
    ),
    async (args) => buildTradeDeskChecklist({
      explicitExecutionRequest: args.explicitExecutionRequest === true,
      account: args.account || null,
      approval: args.approval || null,
      openPositions: args.openPositions || [],
      env: args.env || process.env,
    }),
  );

  addTool(
    "jarvis_morning_brief",
    textSchema(
      "Build a read-only Trading Jarvis morning brief plan. It does not schedule automation, require a token, or place orders.",
      {
        symbols: { type: "array", items: { type: "string" }, default: ["VOLATILITY_75", "VOLATILITY_50"] },
        includeResearch: { type: "array", items: { type: "string" }, default: [] },
        timeframes: { type: "string", default: "60,15", description: "Comma-separated structure and entry timeframes." },
      },
    ),
    async (args) => {
      const [structureTimeframe = "60", entryTimeframe = "15"] = String(args.timeframes || "60,15").split(",").map(item => item.trim()).filter(Boolean);
      return buildMorningBriefPlan({
        symbols: Array.isArray(args.symbols) && args.symbols.length ? args.symbols : ["VOLATILITY_75", "VOLATILITY_50"],
        includeResearch: Array.isArray(args.includeResearch) ? args.includeResearch : [],
        structureTimeframe,
        entryTimeframe,
        runtimeHealth: buildRuntimeHealthReport(),
        toolAvailability: {
          tv_research_set_chart: hasTool("tv_research_set_chart"),
          tv_capture_screenshot: hasTool("tv_capture_screenshot"),
          tv_get_pine_errors: hasTool("tv_get_pine_errors"),
          deriv_research_candles: hasTool("deriv_research_candles"),
          jarvis_scan_watchlist: hasTool("jarvis_scan_watchlist"),
        },
      });
    },
  );

  if (allowLiveTrading) {
    addTool(
      "deriv_place_multiplier_trade",
      textSchema(
        "Place a Deriv multiplier trade. Hidden unless CODEX_ALLOW_LIVE_TRADING=true.",
        {
          symbol: { type: "string", enum: ["VOLATILITY_75", "VOLATILITY_50", "R_75", "R_50"] },
          side: { type: "string", enum: ["long", "short"] },
          stakeUsd: { type: "number", minimum: 1 },
          multiplier: { type: "number", enum: [50, 80, 100, 200, 300, 400, 500, 600, 800] },
          stopLossUsd: { type: "number" },
          takeProfitUsd: { type: "number" },
        },
        ["symbol", "side", "stakeUsd", "multiplier", "stopLossUsd"],
      ),
      async (args) => {
        const validation = validateDerivTradeSize({
          symbol: args.symbol,
          stakeUsd: args.stakeUsd,
          multiplier: args.multiplier,
        });
        if (!validation.ok) throw new Error(validation.message);
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
