import { createHash } from "crypto";

export function normalizeContractId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function stableDecisionPayload(decision = {}) {
  return {
    derivSymbol: decision.derivSymbol ?? null,
    epoch: decision.epoch ?? null,
    side: decision.side ?? null,
    price: decision.price ?? null,
    stakeUsd: decision.stakeUsd ?? null,
    multiplier: decision.multiplier ?? null,
  };
}

export function createDecisionId(decision = {}) {
  const payload = JSON.stringify(stableDecisionPayload(decision));
  return `decision:${createHash("sha256").update(payload).digest("hex")}`;
}

export function createSettlementId(decisionOrContract = {}) {
  const contractId = normalizeContractId(
    typeof decisionOrContract === "object" ? decisionOrContract?.contractId : decisionOrContract
  );
  return contractId ? `settlement:${contractId}` : null;
}

export function createOrderFilledEventId(decisionOrOrder = {}) {
  const contractId = normalizeContractId(
    typeof decisionOrOrder === "object"
      ? decisionOrOrder?.contractId ?? decisionOrOrder?.buy?.contract_id ?? decisionOrOrder?.contract_id
      : decisionOrOrder
  );
  return contractId ? `order-filled:${contractId}` : null;
}
