export type TradeEvent = {
  eventId: string;
  eventType: "ENTRY" | "EXIT";
  symbol: string;
  side: "LONG" | "SHORT";
  cohortKey: string;
  createdAt: string;

  entryPrice?: number | null;
  exitPrice?: number | null;
  tpPrice?: number | null;
  slPrice?: number | null;

  reason?: string | null;
  grade?: string | null;
  setupClass?: string | null;

  pnlPct?: number | null;
  exitR?: number | null;
  mfer?: number | null;
  maer?: number | null;

  raw?: unknown;
};

type SaveResult = {
  ok: true;
  deduped: boolean;
};

type ClearResult = {
  ok: true;
  cleared: true;
};

declare global {
  // eslint-disable-next-line no-var
  var tradeEvents: TradeEvent[] | undefined;

  // eslint-disable-next-line no-var
  var tradeEventIds: Set<string> | undefined;
}

function getEventsStore(): TradeEvent[] {
  if (!globalThis.tradeEvents) {
    globalThis.tradeEvents = [];
  }

  return globalThis.tradeEvents;
}

function getIdsStore(): Set<string> {
  if (!globalThis.tradeEventIds) {
    globalThis.tradeEventIds = new Set<string>();
  }

  return globalThis.tradeEventIds;
}

export async function saveTradeEvent(event: TradeEvent): Promise<SaveResult> {
  const events = getEventsStore();
  const ids = getIdsStore();

  if (ids.has(event.eventId)) {
    return {
      ok: true,
      deduped: true
    };
  }

  ids.add(event.eventId);
  events.unshift(event);

  if (events.length > 5000) {
    const removed = events.splice(5000);

    for (const item of removed) {
      ids.delete(item.eventId);
    }
  }

  return {
    ok: true,
    deduped: false
  };
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return getEventsStore();
}

export async function clearTradeEvents(): Promise<ClearResult> {
  globalThis.tradeEvents = [];
  globalThis.tradeEventIds = new Set<string>();

  return {
    ok: true,
    cleared: true
  };
}