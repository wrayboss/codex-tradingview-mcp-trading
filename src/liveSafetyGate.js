import { existsSync, readFileSync } from "fs";
import path from "path";
import { compareApprovalFingerprint, computeApprovalFingerprint } from "./approvalFingerprint.js";
import { isDerivRealAccount } from "./derivAccountMode.js";

export function isEnvTrue(value) {
  return value === "true";
}

export function assertKillSwitch({ dryRun, env = process.env } = {}) {
  if (!dryRun && isEnvTrue(env.TRADING_KILL_SWITCH)) {
    throw new Error("TRADING_KILL_SWITCH=true. Non-dry-run trading is blocked.");
  }
}

export function assertAccountLiveSafety({ dryRun, account, env = process.env } = {}) {
  if (dryRun) return;
  if (!account?.loginid) {
    throw new Error("Deriv account metadata unavailable. Non-dry-run trading is blocked.");
  }
  if (!isDerivRealAccount(account)) return;
  if (!isEnvTrue(env.ALLOW_REAL_TRADING) || env.DERIV_ALLOWED_REAL_LOGINID !== account.loginid) {
    throw new Error("Real Deriv account detected. Live trading is blocked until ALLOW_REAL_TRADING=true and DERIV_ALLOWED_REAL_LOGINID matches the authorized loginid.");
  }
}

export function loadApprovalRecord(stateDir = "state") {
  const filePath = path.join(stateDir, "backtest-approved.json");
  if (!existsSync(filePath)) {
    throw new Error("Backtest approval missing. Re-run npm run validate-backtest <csv...>.");
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("Backtest approval is invalid JSON. Re-run npm run validate-backtest <csv...>.");
  }
}

export function assertApprovalLiveSafety({ dryRun, account, approval, currentFingerprint } = {}) {
  if (dryRun) return;
  if (!account?.loginid) {
    throw new Error("Deriv account metadata unavailable. Backtest approval cannot be selected.");
  }
  const field = isDerivRealAccount(account) ? "realApproved" : "demoApproved";
  if (approval?.[field] !== true) {
    throw new Error(`Backtest approval missing ${field}=true. Re-run npm run validate-backtest <csv...>.`);
  }
  if (!approval.fingerprint || typeof approval.fingerprint !== "object") {
    throw new Error("Backtest approval is stale: missing fingerprint. Re-run npm run validate-backtest <csv...>.");
  }
  const comparison = compareApprovalFingerprint(approval.fingerprint, currentFingerprint);
  if (!comparison.ok) {
    throw new Error(`Backtest approval is stale: ${comparison.reason}. Re-run npm run validate-backtest <csv...>.`);
  }
}

export function assertRuntimeLiveSafety({
  dryRun,
  account,
  env = process.env,
  approval,
  currentFingerprint,
} = {}) {
  assertKillSwitch({ dryRun, env });
  assertAccountLiveSafety({ dryRun, account, env });
  assertApprovalLiveSafety({ dryRun, account, approval, currentFingerprint });
}

export function loadCurrentApprovalContext({ stateDir = "state" } = {}) {
  return {
    approval: loadApprovalRecord(stateDir),
    currentFingerprint: computeApprovalFingerprint(),
  };
}
