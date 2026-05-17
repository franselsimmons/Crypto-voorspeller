const globalForStore = globalThis;

if (!globalForStore.tradeEvents) globalForStore.tradeEvents = [];
if (!globalForStore.tradeEventIds) globalForStore.tradeEventIds = new Set();

export async function saveTradeEvent(event) {
  const events = globalForStore.tradeEvents;
  const ids = globalForStore.tradeEventIds;

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
  globalForStore.tradeEventIds = new Set();

  return {
    ok: true,
    cleared: true
  };
}