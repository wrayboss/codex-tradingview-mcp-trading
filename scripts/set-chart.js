/**
 * One-shot CDP script: set TradingView chart to a given symbol and timeframe.
 * Usage: node scripts/set-chart.js [symbol] [timeframe]
 *   symbol    - e.g. VOLATILITY_75, R_75, or Deriv:VOLATILITY_75_INDEX (default)
 *   timeframe - e.g. "15" (default)
 */

import WebSocket from "ws";

const SYMBOL_MAP = {
  VOLATILITY_75: "Deriv:VOLATILITY_75_INDEX",
  R_75: "Deriv:VOLATILITY_75_INDEX",
  VOLATILITY_50: "Deriv:VOLATILITY_50_INDEX",
  R_50: "Deriv:VOLATILITY_50_INDEX",
};

const SYMBOL    = SYMBOL_MAP[process.argv[2]] || process.argv[2] || "Deriv:VOLATILITY_75_INDEX";
const TIMEFRAME = process.argv[3] || "15";
const CDP_URL   = "http://localhost:9222";

async function getChartTarget() {
  const res     = await fetch(`${CDP_URL}/json`);
  const targets = await res.json();
  const chart   = targets.find(t => t.url && t.url.includes("tradingview.com/chart/"));
  if (!chart) throw new Error("No TradingView chart page found — is TradingView open?");
  return chart;
}

async function cdpSession(wsUrl) {
  let msgId = 0;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.once("open",  resolve);
    ws.once("error", reject);
  });

  ws.on("message", raw => {
    const msg = JSON.parse(raw);
    if (!pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "eval failed");
    return r.result?.value;
  };

  const key = async (key, code, keyCode, modifiers = 0) => {
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: keyCode, modifiers });
    }
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));

  const close = () => ws.close();

  return { send, evaluate, key, wait, close };
}

async function main() {
  const target = await getChartTarget();
  console.log(`[cdp] Connected to: ${target.url}`);

  const { send, evaluate, key, wait, close } = await cdpSession(target.webSocketDebuggerUrl);
  await send("Runtime.enable");

  // ── Step 1: open symbol search via keyboard shortcut (TradingView: just type the symbol) ──
  console.log(`[cdp] Opening symbol search for "${SYMBOL}"...`);

  // Click the chart area first to ensure focus
  const chartCenter = await evaluate(`(() => {
    const chart = document.querySelector('.chart-container, .layout__area--center, canvas');
    if (!chart) return { x: 600, y: 400 };
    const r = chart.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);

  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: chartCenter.x, y: chartCenter.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: chartCenter.x, y: chartCenter.y, button: "left", clickCount: 1 });
  await wait(300);

  // Find and click the symbol ticker element at the top
  const tickerPos = await evaluate(`(() => {
    const sel = [
      '[data-name="legend-series-item"] .apply-overflow-tooltip',
      '.chart-symbol-menu-header .js-symbol-header-title',
      '#header-toolbar-symbol-search',
      'div[data-name="legend-source-title"]',
      '.tv-symbol-header__exchange',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) { const r = el.getBoundingClientRect(); if (r.width > 0) return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), sel: s }; }
    }
    // Fallback: look for the symbol search button in toolbar
    const btns = [...document.querySelectorAll('button,div[role=button]')];
    const btn = btns.find(b => {
      const t = (b.textContent || '').trim();
      return /R_75|R_50|Volatility|AAPL|BTC/.test(t) && b.getBoundingClientRect().width > 0;
    });
    if (btn) { const r = btn.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), sel: 'auto' }; }
    return null;
  })()`);

  if (tickerPos) {
    console.log(`[cdp] Clicking symbol ticker at (${tickerPos.x}, ${tickerPos.y}) [${tickerPos.sel}]`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: tickerPos.x, y: tickerPos.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tickerPos.x, y: tickerPos.y, button: "left", clickCount: 1 });
    await wait(700);
  } else {
    console.log("[cdp] Ticker not found — using keyboard shortcut");
    // TradingView opens symbol search when you just start typing
  }

  // Type the symbol into the search box
  const searchReady = await evaluate(`(() => {
    const input = [...document.querySelectorAll('input')].find(i =>
      (i.placeholder || '').toLowerCase().includes('search') && i.getBoundingClientRect().width > 0
    );
    if (!input) return false;
    input.focus();
    return true;
  })()`);

  if (!searchReady) {
    console.log("[cdp] Search input not visible — trying keyboard shortcut /");
    await key("/", "Slash", 191);
    await wait(600);
  }

  // Clear and type symbol
  await key("a", "KeyA", 65, 2); // Ctrl+A
  await send("Input.insertText", { text: SYMBOL });
  await wait(1200);

  // Wait for results and pick the first exact Deriv/Synthetic match
  const resultPos = await evaluate(`(() => {
    const target = ${JSON.stringify(SYMBOL)}.toLowerCase();
    const rows = [...document.querySelectorAll(
      '[data-name="market-search-item"], .js-market-list-item, [class*="listItem"], [class*="searchResult"]'
    )].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    // Prefer "Deriv" or "Synthetic" tagged rows
    const preferred = rows.find(el => /deriv|synthetic/i.test(el.textContent));
    const first = preferred || rows[0];
    if (!first) return null;
    const r = first.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);

  if (resultPos) {
    console.log(`[cdp] Clicking search result at (${resultPos.x}, ${resultPos.y})`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: resultPos.x, y: resultPos.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: resultPos.x, y: resultPos.y, button: "left", clickCount: 1 });
  } else {
    console.log("[cdp] No result rows found — pressing Enter");
    await key("Enter", "Enter", 13);
  }
  await wait(1500);

  // ── Step 2: set timeframe to 15m ──────────────────────────────────────────────
  console.log(`[cdp] Setting timeframe to ${TIMEFRAME}m...`);

  // Click the timeframe input box in the toolbar
  const tfPos = await evaluate(`(() => {
    const sel = [
      '#header-toolbar-intervals',
      '[data-name="header-toolbar-intervals"]',
      'button[id*="interval"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) { const r = el.getBoundingClientRect(); if (r.width > 0) return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), sel: s }; }
    }
    // Fallback: find interval button by text (e.g. "15", "1H", "D")
    const btns = [...document.querySelectorAll('button,div[role=button]')];
    const tf = btns.find(b => {
      const t = (b.textContent || b.getAttribute('aria-label') || '').trim();
      return /^(\d+[mMhHdDwW]?|D|W|M)$/.test(t) && b.getBoundingClientRect().width > 0;
    });
    if (tf) { const r = tf.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), sel: 'auto-tf' }; }
    return null;
  })()`);

  if (tfPos) {
    console.log(`[cdp] Clicking timeframe selector at (${tfPos.x}, ${tfPos.y}) [${tfPos.sel}]`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: tfPos.x, y: tfPos.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tfPos.x, y: tfPos.y, button: "left", clickCount: 1 });
    await wait(600);

    // Look for the 15m option in the dropdown
    const tfOptionPos = await evaluate(`(() => {
      const target = ${JSON.stringify(TIMEFRAME)};
      const items = [...document.querySelectorAll('[data-name*="menu-item"], [class*="item"], [role="option"], li')].filter(el => {
        const r = el.getBoundingClientRect();
        const t = (el.textContent || '').trim();
        return r.width > 0 && r.height > 0 && (t === target || t === target + 'm' || t === target + ' min');
      });
      if (!items.length) return null;
      const r = items[0].getBoundingClientRect();
      return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
    })()`);

    if (tfOptionPos) {
      console.log(`[cdp] Clicking 15m option at (${tfOptionPos.x}, ${tfOptionPos.y})`);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: tfOptionPos.x, y: tfOptionPos.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tfOptionPos.x, y: tfOptionPos.y, button: "left", clickCount: 1 });
      await wait(800);
    } else {
      // Escape and try right-click on chart → change interval
      await key("Escape", "Escape", 27);
      console.log("[cdp] 15m option not found in dropdown — trying direct keyboard shortcut");
      // TradingView shortcut: Alt+1 for 1m... no standard shortcut for 15m
      // Type in the interval toolbar if it has an input
      await send("Input.insertText", { text: TIMEFRAME });
      await key("Enter", "Enter", 13);
      await wait(600);
    }
  } else {
    console.log("[cdp] Timeframe toolbar not found");
  }

  // ── Verify ────────────────────────────────────────────────────────────────────
  await wait(1000);
  const pageTitle = await evaluate(`document.title`);
  console.log(`[cdp] Page title: ${pageTitle}`);
  console.log("[cdp] Done.");

  close();
}

main().catch(err => {
  console.error("[cdp] Error:", err.message);
  process.exit(1);
});
