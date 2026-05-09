# Browser Checks

Codex has built-in browser capability for local browser work. Use it when the user asks to open, inspect, click, type, test, or screenshot:

- `http://localhost:*`
- `http://127.0.0.1:*`
- `file://` local HTML files
- local preview URLs printed by dev servers

## Rules

- Do not use public web browsing as a substitute for inspecting a local app.
- Start the required dev server first, then use the exact URL printed by the server.
- If the expected port is busy, use the new port printed by the toolchain.
- Verify that the page is nonblank and that the target UI is actually rendered before claiming a browser check passed.
- For frontend changes, test at least one desktop-sized viewport and one mobile-sized viewport when layout risk exists.
- For TradingView chart actions, verify chart state through the Codex TradingView bridge when available; browser visibility alone is not enough.

## PovertyKillerEA

Likely local targets:

- Vite dev server from `pnpm run dev`
- Full stack from `pnpm run dev:stack`
- Preview server from `pnpm run preview`

Always use the actual terminal output for the URL.

## claude-tradingview-mcp-trading

Likely browser-relevant tasks:

- TradingView chart observation through local bridge/CDP.
- Local report or dashboard pages if added later.
- Static docs or generated HTML reports opened by `file://`.

For chart changes, separate these claims:

- chart control worked,
- Pine compiled,
- strategy attached to chart,
- strategy was profitable.

Each requires different evidence.
