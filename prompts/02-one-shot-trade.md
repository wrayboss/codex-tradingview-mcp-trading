# Deriv Bot Local Onboarding Prompt

Paste this into a local coding agent when you want it to set up and verify this repository.

---

You are onboarding the current Deriv breakout-retest bot. Follow the repository files exactly and do not use the retired BitGet/crypto-exchange flow.

Use `gpt-5.5` when the host asks for a model. This repo does not call the OpenAI API directly, so do not add a model wrapper or OpenAI dependency as part of onboarding. Work outcome-first: the goal is a verified local setup with dependencies installed, config prepared, tests passing, TradingView reachable when available, and live/demo execution blocked until gates pass.

Evidence rules:

- Never print `DERIV_API_TOKEN`.
- Report exact commands run and whether they passed.
- If a required manual step is missing, name the missing step and stop there.
- Do not guess about account, chart, or gate state.

## Step 1 - Install Dependencies

Run:

```powershell
npm install
```

## Step 2 - Create Local Environment

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Ask the user to fill:

```env
DERIV_API_TOKEN=your_deriv_api_token_here
DERIV_APP_ID=129133
SYMBOL=VOLATILITY_75
# Leave MULTIPLIER unset for symbol defaults, or use 50 for VOLATILITY_75.
# MULTIPLIER=50
STAKE_USD=10
STOP_LOSS_USD=5
MAX_TRADES_PER_DAY=3
```

Explain that `SYMBOL` may be `VOLATILITY_75` or `VOLATILITY_50`. If `SYMBOL` is omitted, loop mode iterates every symbol in `rules.json`. Do not use `R_75` or `R_50` in `.env`; the bot maps those internally.

## Step 3 - Verify Code

Run:

```powershell
npm test
npm run codex:check
```

## Step 4 - Launch TradingView For Chart Tools

Run:

```powershell
npm run launch
```

Then call `tv_health_check` from the MCP bridge. It must report a connected TradingView target before chart actions.

Open a 15m Deriv chart for `R_75` or `R_50`. Optional helper:

```powershell
node scripts/set-chart.js "Volatility 75 Index" 15
node scripts/set-chart.js "Volatility 50 Index" 15
```

Paste `pine/breakout_retest_v1.pine` into TradingView's Pine Editor, add it to the chart, and verify there are no Pine compile errors.

## Step 5 - Dry-Run First

Run:

```powershell
npm run dry-run
npm run loop:dry
```

Dry-run authorizes Deriv and fetches live candles, but it never places an order.

## Step 6 - Backtest Gate Before Live/Demo Orders

Export TradingView Strategy Tester List of Trades CSVs for both `R_75` and `R_50`, then run:

```powershell
npm run validate-backtest R_75-export.csv R_50-export.csv
```

Live/demo order placement through `npm run trade` or `npm run loop` is blocked until `state/backtest-approved.json` contains `approved: true`.

## Step 7 - Live/Demo Execution

For one selected-symbol cycle:

```powershell
npm run trade
```

For autonomous 15m-bar operation:

```powershell
npm run loop
```

Never print or commit `DERIV_API_TOKEN`. Do not add Crash/Boom symbols unless the user explicitly changes the strategy.
