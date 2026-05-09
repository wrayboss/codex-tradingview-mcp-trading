import { resolveResearchSymbol } from "./derivSymbolRegistry.js";

function isEnvTrue(value) {
  return value === "true";
}

function usableToken(token = "") {
  return Boolean(token && !token.startsWith("your_") && token.length > 8);
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function gate(id, label, pass, detail) {
  return { id, label, pass: Boolean(pass), detail };
}

function accountMode(account) {
  if (!account?.loginid) return "unknown";
  if (account.is_virtual === false || account.is_virtual === 0 || account.is_virtual === "0") return "real";
  if (account.is_virtual === true || account.is_virtual === 1 || account.is_virtual === "1") return "demo";
  return String(account.loginid).toUpperCase().startsWith("VRTC") ? "demo" : "real";
}

function resolveSymbol(symbol) {
  try {
    return resolveResearchSymbol(symbol || "VOLATILITY_75");
  } catch (err) {
    return { symbol, executionSupported: false, error: err.message };
  }
}

export function buildSafeTradeGateReport({
  explicitExecutionRequest = false,
  env = process.env,
  account = null,
  approval = null,
  openPositions = null,
  networkCalls = false,
  now = new Date(),
} = {}) {
  const symbol = env.SYMBOL || "VOLATILITY_75";
  const resolved = resolveSymbol(symbol);
  const mode = accountMode(account);
  const approvalField = mode === "real" ? "realApproved" : "demoApproved";
  const openPositionCount = Array.isArray(openPositions) ? openPositions.length : null;
  const gates = [
    gate(
      "explicit_current_request",
      "Explicit current-chat execution request",
      explicitExecutionRequest,
      explicitExecutionRequest ? "present" : "missing explicit current-chat execution request",
    ),
    gate(
      "token_present",
      "DERIV_API_TOKEN present",
      usableToken(env.DERIV_API_TOKEN || ""),
      usableToken(env.DERIV_API_TOKEN || "") ? "present" : "missing or placeholder token",
    ),
    gate(
      "kill_switch_off",
      "TRADING_KILL_SWITCH is not true",
      !isEnvTrue(env.TRADING_KILL_SWITCH),
      isEnvTrue(env.TRADING_KILL_SWITCH) ? "TRADING_KILL_SWITCH=true" : "off",
    ),
    gate(
      "account_verified",
      "Deriv account mode verified",
      Boolean(account?.loginid),
      account?.loginid ? `${mode}:${account.loginid}` : "account not verified",
    ),
    gate(
      "backtest_approval",
      `${mode === "real" ? "Real" : "Demo"} backtest approval`,
      approval?.[approvalField] === true,
      approval?.[approvalField] === true ? `${approvalField}=true` : `${approvalField} missing or false`,
    ),
    gate(
      "open_positions_checked",
      "Open position check",
      Array.isArray(openPositions),
      Array.isArray(openPositions) ? "checked" : "Open position check not run",
    ),
    gate(
      "no_open_positions",
      "No open Deriv positions",
      Array.isArray(openPositions) && openPositions.length === 0,
      openPositionCount == null ? "unknown" : `${openPositionCount} open position(s)`,
    ),
    gate(
      "symbol_execution_supported",
      "Symbol is execution-supported",
      Boolean(resolved.executionSupported),
      resolved.error || symbol,
    ),
    gate(
      "stake_present",
      "STAKE_USD positive",
      positiveNumber(env.STAKE_USD),
      positiveNumber(env.STAKE_USD) ? `${env.STAKE_USD}` : "STAKE_USD must be a positive number",
    ),
    gate(
      "stop_loss_present",
      "STOP_LOSS_USD positive",
      positiveNumber(env.STOP_LOSS_USD),
      positiveNumber(env.STOP_LOSS_USD) ? `${env.STOP_LOSS_USD}` : "STOP_LOSS_USD must be a positive number",
    ),
    gate(
      "real_account_lock",
      "Real account lock",
      mode !== "real" || (isEnvTrue(env.ALLOW_REAL_TRADING) && env.DERIV_ALLOWED_REAL_LOGINID === account?.loginid),
      mode !== "real" ? "demo account" : "requires ALLOW_REAL_TRADING=true and DERIV_ALLOWED_REAL_LOGINID match",
    ),
  ];
  const blockers = gates.filter(item => !item.pass).map(item => `${item.label}: ${item.detail}`);

  return {
    generatedAt: now.toISOString(),
    mode: "safe_trade_gate",
    readOnly: true,
    networkCalls: Boolean(networkCalls),
    allowed: blockers.length === 0,
    blockers,
    symbol: {
      requested: symbol,
      normalized: resolved.symbol || symbol,
      executionSupported: Boolean(resolved.executionSupported),
    },
    account: account
      ? {
          loginid: account.loginid,
          is_virtual: account.is_virtual,
          currency: account.currency,
          mode,
        }
      : null,
    openPositions: {
      checked: Array.isArray(openPositions),
      count: openPositionCount,
    },
    gates,
    nextCommand: blockers.length === 0 ? "npm run dry-run before npm run trade or npm run loop" : "resolve blockers before execution",
  };
}

export function formatSafeTradeGateReport(report) {
  const lines = [
    "Safe trade gate",
    `- allowed: ${report.allowed}`,
    `- readOnly: ${report.readOnly}`,
    `- networkCalls: ${report.networkCalls}`,
    `- symbol: ${report.symbol.normalized}`,
    `- account: ${report.account ? `${report.account.mode}:${report.account.loginid}` : "unknown"}`,
    `- open positions: ${report.openPositions.checked ? report.openPositions.count : "unknown"}`,
  ];
  if (report.blockers.length) {
    lines.push("- blockers:");
    lines.push(...report.blockers.map(item => `  - ${item}`));
  }
  lines.push(`- next: ${report.nextCommand}`);
  return lines.join("\n");
}
