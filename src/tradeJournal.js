import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";

export const TRADE_EVENT_SCHEMA_VERSION = 1;
export const TRADE_EVENTS_FILE = "state/trade-events.jsonl";

export function buildTradeEvent(event = {}) {
  return {
    eventId: event.eventId ?? null,
    eventType: event.eventType ?? null,
    timestamp: event.timestamp ?? new Date().toISOString(),
    schemaVersion: TRADE_EVENT_SCHEMA_VERSION,
    contractId: event.contractId ?? null,
    decisionId: event.decisionId ?? null,
    symbol: event.symbol ?? null,
    derivSymbol: event.derivSymbol ?? null,
    mode: event.mode ?? null,
    payload: event.payload ?? {},
  };
}

export function loadTradeEvents({ filePath = TRADE_EVENTS_FILE } = {}) {
  if (!existsSync(filePath)) return { events: [], skipped: 0 };
  const content = readFileSync(filePath, "utf8");
  const events = [];
  let skipped = 0;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") events.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }

  return { events, skipped };
}

export function hasTradeEvent(eventId, { filePath = TRADE_EVENTS_FILE } = {}) {
  if (!eventId || !existsSync(filePath)) return false;
  const { events } = loadTradeEvents({ filePath });
  return events.some(event => event?.eventId === eventId);
}

export function appendTradeEvent(event, { filePath = TRADE_EVENTS_FILE } = {}) {
  const built = buildTradeEvent(event);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(built) + "\n");
  return { appended: true, event: built };
}

export function appendTradeEventOnce(event, { filePath = TRADE_EVENTS_FILE } = {}) {
  const built = buildTradeEvent(event);
  if (!built.eventId) {
    return { appended: false, reason: "missing_event_id", event: built };
  }
  if (hasTradeEvent(built.eventId, { filePath })) {
    return { appended: false, reason: "duplicate_event_id", event: built };
  }
  return appendTradeEvent(built, { filePath });
}
