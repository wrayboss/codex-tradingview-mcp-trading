import { createHash } from "crypto";

export const STRATEGY_APPROVAL_MODEL_VERSION = 1;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function strategyIdOf(input = {}) {
  return input.strategyId ?? input.strategy_id ?? input.strategy ?? null;
}

function strategyVersionOf(input = {}) {
  return input.strategyVersion ?? input.strategy_version ?? input.version ?? null;
}

function timeframesOf(input = {}) {
  return input.timeframes && typeof input.timeframes === "object" ? input.timeframes : {};
}

function scopedFields(input = {}) {
  return {
    approvalModelVersion: STRATEGY_APPROVAL_MODEL_VERSION,
    strategyId: strategyIdOf(input),
    strategyVersion: strategyVersionOf(input),
    symbol: input.symbol ?? null,
    timeframes: timeframesOf(input),
    rulesHash: input.rulesHash ?? input.rules_hash ?? null,
    pineHash: input.pineHash ?? input.pine_hash ?? null,
    validatorSchemaVersion: input.validatorSchemaVersion ?? input.validator_schema_version ?? null,
    packageHash: input.packageHash ?? input.package_hash ?? null,
    packageLockHash: input.packageLockHash ?? input.package_lock_hash ?? null,
    runtimeFingerprint: input.runtimeFingerprint ?? input.runtime_fingerprint ?? null,
  };
}

export function buildStrategyApprovalKey(input = {}) {
  const fields = scopedFields(input);
  const suffix = hashValue(fields).slice(0, 24);
  return `${fields.strategyId}@${fields.strategyVersion}:${fields.symbol}:${suffix}`;
}

export function buildStrategyApprovalRecords({
  fingerprint,
  symbols = fingerprint?.symbols,
  approved = false,
  demoApproved = approved === true,
  realApproved = approved === true,
  files = [],
  validatedAt = new Date().toISOString(),
} = {}) {
  const selectedSymbols = Array.isArray(symbols) ? symbols : [];
  return selectedSymbols.map(symbol => {
    const fields = scopedFields({ ...fingerprint, symbol });
    const record = {
      ...fields,
      key: buildStrategyApprovalKey(fields),
      approved: approved === true,
      demoApproved: demoApproved === true,
      realApproved: realApproved === true,
      files: [...files],
      validatedAt,
    };
    return record;
  });
}

export function scopedApprovalRecords(approval = {}) {
  if (Array.isArray(approval?.strategyApprovals)) return approval.strategyApprovals;
  if (approval?.strategyApprovalsByKey && typeof approval.strategyApprovalsByKey === "object") {
    return Object.values(approval.strategyApprovalsByKey);
  }
  return [];
}

function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function matchesFingerprint(record, fingerprint = {}) {
  const expected = scopedFields({ ...fingerprint, symbol: record.symbol });
  return record.strategyId === expected.strategyId
    && String(record.strategyVersion) === String(expected.strategyVersion)
    && sameJson(record.timeframes || {}, expected.timeframes || {})
    && record.rulesHash === expected.rulesHash
    && record.pineHash === expected.pineHash
    && record.validatorSchemaVersion === expected.validatorSchemaVersion
    && record.packageHash === expected.packageHash
    && record.packageLockHash === expected.packageLockHash
    && record.runtimeFingerprint === expected.runtimeFingerprint;
}

export function findStrategyApproval({ approval, fingerprint = null, symbol } = {}) {
  const records = scopedApprovalRecords(approval);
  const wantedSymbol = symbol ?? fingerprint?.symbols?.[0] ?? null;
  if (!records.length || !wantedSymbol) return null;
  return records.find(record => {
    if (record.symbol !== wantedSymbol) return false;
    return fingerprint ? matchesFingerprint(record, fingerprint) : true;
  }) || null;
}

export function approvalFieldForAccountMode(accountMode) {
  return accountMode === "real" ? "realApproved" : "demoApproved";
}

export function isApprovalGrantedFor({ approval, fingerprint = null, symbol, accountMode = "demo" } = {}) {
  const field = approvalFieldForAccountMode(accountMode);
  const records = scopedApprovalRecords(approval);
  if (records.length) {
    const record = findStrategyApproval({ approval, fingerprint, symbol });
    if (!record) {
      return {
        ok: false,
        scoped: true,
        field,
        reason: `No strategy-scoped approval for ${symbol || "requested symbol"}`,
      };
    }
    if (record[field] !== true) {
      return {
        ok: false,
        scoped: true,
        field,
        record,
        reason: `Scoped approval ${record.key} has ${field}=false`,
      };
    }
    return { ok: true, scoped: true, field, record };
  }

  return {
    ok: approval?.[field] === true,
    scoped: false,
    field,
    reason: approval?.[field] === true ? "legacy approval granted" : `${field} missing or false`,
  };
}

export function parameterHash(parameters = {}) {
  return hashValue(parameters).slice(0, 32);
}
