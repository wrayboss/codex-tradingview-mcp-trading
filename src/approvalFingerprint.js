import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";

export const APPROVAL_SCHEMA_VERSION = 3;

export function sha256File(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sha256Value(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
  packageLockPath = "package-lock.json",
  includeGitCommit = true,
} = {}) {
  const rules = JSON.parse(readFileSync(rulesPath, "utf8"));
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const packageHash = sha256File(packagePath);
  const packageLockHash = sha256File(packageLockPath);
  const runtimeFingerprint = sha256Value({
    package_hash: packageHash,
    package_lock_hash: packageLockHash,
    node_engine: packageJson.engines?.node ?? null,
    package_type: packageJson.type ?? null,
  });
  const fingerprint = {
    schema_version: APPROVAL_SCHEMA_VERSION,
    rules_hash: sha256File(rulesPath),
    pine_hash: sha256File(pinePath),
    package_hash: packageHash,
    package_lock_hash: packageLockHash,
    runtime_fingerprint: runtimeFingerprint,
    strategy: rules.strategy,
    strategy_id: rules.strategy,
    version: rules.version,
    strategy_version: rules.version,
    symbols: Array.isArray(rules.symbols) ? [...rules.symbols] : [],
    timeframes: { ...(rules.timeframes || {}) },
    validator_schema_version: APPROVAL_SCHEMA_VERSION,
    rules_path: rulesPath,
    pine_path: pinePath,
    package_path: packagePath,
    package_lock_path: packageLockPath,
  };
  if (includeGitCommit) fingerprint.git_commit = optionalGitSha();
  return fingerprint;
}

export function compareApprovalFingerprint(approved, current) {
  const required = [
    "schema_version",
    "rules_hash",
    "package_hash",
    "package_lock_hash",
    "runtime_fingerprint",
    "strategy",
    "strategy_id",
    "version",
    "strategy_version",
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

  for (const field of ["schema_version", "rules_hash", "pine_hash", "package_hash", "package_lock_hash", "runtime_fingerprint", "strategy", "strategy_id", "version", "strategy_version", "validator_schema_version"]) {
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
