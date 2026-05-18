import type {
  NormalizedWebhookEvent,
  NormalizedEntry,
  NormalizedExit,
  NormalizedReject
} from "./normalize";

import {
  saveTradeEvent as saveStoredTradeEvent,
  listTradeEvents,
  getTradeEventCount,
  clearTradeEventsForDebugOnly,
  type SaveTradeEventResult,
  type TradeEvent
} from "./store";

function withEventType<T extends NormalizedWebhookEvent>(
  event: T,
  eventType: string
): T {
  return {
    ...event,
    eventType,
    action: eventType
  };
}

async function saveRepositoryEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return saveStoredTradeEvent(event);
}

export async function insertTradeEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(event);
}

export async function saveWebhookEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(event);
}

export async function saveNormalizedWebhookEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(event);
}

export async function upsertWebhookEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(event);
}

export async function insertEntry(
  entry: NormalizedEntry
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(withEventType(entry, "ENTRY"));
}

export async function saveEntry(
  entry: NormalizedEntry
): Promise<SaveTradeEventResult> {
  return insertEntry(entry);
}

export async function saveTradeEntry(
  entry: NormalizedEntry
): Promise<SaveTradeEventResult> {
  return insertEntry(entry);
}

export async function insertTradeEntry(
  entry: NormalizedEntry
): Promise<SaveTradeEventResult> {
  return insertEntry(entry);
}

export async function insertExit(
  exit: NormalizedExit
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(withEventType(exit, "EXIT"));
}

export async function saveExit(
  exit: NormalizedExit
): Promise<SaveTradeEventResult> {
  return insertExit(exit);
}

export async function saveTradeExit(
  exit: NormalizedExit
): Promise<SaveTradeEventResult> {
  return insertExit(exit);
}

export async function insertTradeExit(
  exit: NormalizedExit
): Promise<SaveTradeEventResult> {
  return insertExit(exit);
}

export async function insertReject(
  reject: NormalizedReject
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(withEventType(reject, "REJECT"));
}

export async function saveReject(
  reject: NormalizedReject
): Promise<SaveTradeEventResult> {
  return insertReject(reject);
}

export async function saveTradeReject(
  reject: NormalizedReject
): Promise<SaveTradeEventResult> {
  return insertReject(reject);
}

export async function insertTradeReject(
  reject: NormalizedReject
): Promise<SaveTradeEventResult> {
  return insertReject(reject);
}

export async function insertSnapshot(
  snapshot: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return saveRepositoryEvent(withEventType(snapshot, "SNAPSHOT"));
}

export async function saveSnapshot(
  snapshot: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return insertSnapshot(snapshot);
}

export async function saveTradeSnapshot(
  snapshot: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  return insertSnapshot(snapshot);
}

export async function saveNormalizedEvents(
  events: NormalizedWebhookEvent[]
): Promise<{
  ok: boolean;
  total: number;
  stored: number;
  deduped: number;
  failed: number;
  results: SaveTradeEventResult[];
}> {
  const results: SaveTradeEventResult[] = [];

  let stored = 0;
  let deduped = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const result = await saveRepositoryEvent(event);
      results.push(result);

      if (result.stored) stored += 1;
      if (result.deduped) deduped += 1;
    } catch (error) {
      failed += 1;

      results.push({
        ok: false,
        stored: false,
        deduped: false,
        persistent: false,
        key: "repository",
        eventId: String(event?.eventId || "UNKNOWN"),
        count: null
      });

      console.warn("TRADE_REPOSITORY_SAVE_FAILED:", {
        eventId: event?.eventId || null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    ok: failed === 0,
    total: events.length,
    stored,
    deduped,
    failed,
    results
  };
}

export async function saveWebhookEvents(
  events: NormalizedWebhookEvent[]
): Promise<{
  ok: boolean;
  total: number;
  stored: number;
  deduped: number;
  failed: number;
  results: SaveTradeEventResult[];
}> {
  return saveNormalizedEvents(events);
}

export async function listWebhookEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function getWebhookEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function listRepositoryEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function countWebhookEvents(): Promise<number> {
  return getTradeEventCount();
}

export async function getRepositoryEventCount(): Promise<number> {
  return getTradeEventCount();
}

export async function clearWebhookEvents(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  return clearTradeEventsForDebugOnly();
}

export async function clearRepositoryEvents(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  return clearTradeEventsForDebugOnly();
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  return clearTradeEventsForDebugOnly();
}