# Linux Setup Guide

Everything in the main README applies — the only differences are how TradingView is installed and launched on Linux.

---

## 1. Install TradingView Desktop

TradingView Desktop is available for Linux via:

**Option A — Flatpak (recommended):**
```bash
flatpak install flathub com.tradingview.TradingViewDesktop
```

**Option B — Snap:**
```bash
sudo snap install tradingview
```

**Option C — AppImage:**
Download from the [TradingView website](https://www.tradingview.com/desktop/) and make it executable:
```bash
chmod +x TradingView-*.AppImage
```

---

## 2. Launch TradingView with CDP enabled

Close TradingView if it's running. Then launch with the remote debugging flag:

**Flatpak:**
```bash
flatpak run com.tradingview.TradingViewDesktop --remote-debugging-port=9222
```

**Snap:**
```bash
tradingview --remote-debugging-port=9222
```

**AppImage:**
```bash
./TradingView-*.AppImage --remote-debugging-port=9222
```

**Tip:** Create a shell alias so you don't have to remember the flag:
```bash
echo 'alias tv="flatpak run com.tradingview.TradingViewDesktop --remote-debugging-port=9222"' >> ~/.bashrc
source ~/.bashrc
```
Then just type `tv` to launch.

---

## 3. Configure The Codex Bridge

For Codex-side tools, install the local bridge from the repo root:

```bash
node codex-mcp/server.js --self-test
```

Then register the bridge in Codex's config using the Windows installer as a reference for the expected `codex-mcp/server.js` command. Do not modify Claude Code MCP config unless you are intentionally configuring Claude Code separately.

---

## 4. Verify the connection

From the MCP bridge:

```
tv_health_check
```

If it reports a connected TradingView target, you are ready to open `R_75` or `R_50` on a 15m chart. If not:
- Confirm TradingView is running with `--remote-debugging-port=9222` (not launched normally)
- Check nothing else is using port 9222: `lsof -i :9222`
- Try: `pkill -f TradingView` then relaunch with the flag

---

## 5. Continue with the main setup

Once `tv_health_check` passes, go back to the [main README](../README.md) and continue from Step 2.
