import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";

export const APPROVAL_SCHEMA_VERSION = 2;

function sha256File(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function optionalGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function computeApprovalFingerprint({
  rulesPath = "rules.json",
  pinePath = "pine/breakout_retest_v1.pine",
  packagePath = "package.json",
  includeGitCommit = true,
} = {}) {
  const rules = JSON.parse(readFileSync(rulesPath, "utf8"));
  const fingerprint = {
    schema_version: APPROVAL_SCHEMA_VERSION,
    rules_hash: sha256File(rulesPath),
    pine_hash: sha256File(pinePath),
    package_hash: sha256File(packagePath),
    strategy: rules.strategy,
    version: rules.version,
    symbols: Array.isArray(rules.symbols) ? [...rules.symbols] : [],
    timeframes: { ...(rules.timeframes || {}) },
    validator_schema_version: APPROVAL_SCHEMA_VERSION,
  };
  if (includeGitCommit) fingerprint.git_commit = optionalGitSha();
  return fingerprint;
}

export function compareApprovalFingerprint(approved, current) {
  const required = [
    "schema_version",
    "rules_hash",
    "package_hash",
    "strategy",
    "version",
    "symbols",
    "timeframes",
    "validator_schema_version",
  ];
  for (const field of required) {
    if (!(field in (approved || {}))) {
      return { ok: false, reason: `missing ${field}` };
    }
  }
  if (!("pine_hash" in approved)) return { ok: false, reason: "missing pine_hash" };

  for (const field of ["schema_version", "rules_hash", "pine_hash", "package_hash", "strategy", "version", "validator_schema_version"]) {
    if (approved[field] !== current[field]) return { ok: false, reason: `${field} mismatch` };
  }
  if (JSON.stringify(approved.symbols) !== JSON.stringify(current.symbols)) {
    return { ok: false, reason: "symbols mismatch" };
  }
  if (JSON.stringify(approved.timeframes) !== JSON.stringify(current.timeframes)) {
    return { ok: false, reason: "timeframes mismatch" };
  }
  return { ok: true };
}
