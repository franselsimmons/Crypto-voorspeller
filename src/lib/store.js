type TradeEvent = {
  eventId: string;
  eventType: "ENTRY" | "EXIT";
  symbol: string;
  side: "LONG" | "SHORT";
  cohortKey: string;
  createdAt: string;

  entryPrice: number | null;
  exitPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;

  reason: string | null;
  grade: string | null;
  setupClass: string | null;

  pnlPct: number | null;
  exitR: number | null;
  mfer: number | null;
  maer: number | null;

  raw: Record<string, any>;
};

const globalForStore = globalThis as unknown as {
  tradeEvents?: TradeEvent[];
  tradeEventIds?: Set<string>;
};

if (!globalForStore.tradeEvents) globalForStore.tradeEvents = [];
if (!globalForStore.tradeEventIds) globalForStore.tradeEventIds = new Set<string>();

export async function saveTradeEvent(event: TradeEvent) {
  const events = globalForStore.tradeEvents!;
  const ids = globalForStore.tradeEventIds!;

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

export async function getTradeEvents() {
  return globalForStore.tradeEvents || [];
}

export async function clearTradeEvents() {
  globalForStore.tradeEvents = [];
  globalForStore.tradeEventIds = new Set<string>();

  return {
    ok: true,
    cleared: true
  };
}