import type { NormalizedWebhookEvent } from "./normalize";

export type TradeEvent = NormalizedWebhookEvent;

type RedisCommand = Array<string | number>;
type AnyRecord = Record<string, unknown>;

type SaveTradeEventResult = {
  ok: boolean;
  stored: boolean;
  deduped: boolean;
  persistent: boolean;
  key: string;
  eventId: string;
  count?: number | null;
};

const TRADE_EVENTS_KEY =
  process.env.TRADE_EVENTS_KEY || "tradesystem:events:v1";

const TRADE_DEDUPE_KEY =
  process.env.TRADE_DEDUPE_KEY || "tradesystem:events:dedupe:v1";

const TRADE_EVENTS_MAX_ROWS = Math.max(
  1000,
  Number(process.env.TRADE_EVENTS_MAX_ROWS || 50000)
);

const TRADE_EVENTS_READ_ROWS = Math.max(
  50,
  Number(process.env.TRADE_EVENTS_READ_ROWS || 1500)
);

const TRADE_EVENTS_READ_CHUNK = Math.max(
  5,
  Math.min(80, Number(process.env.TRADE_EVENTS_READ_CHUNK || 40))
);

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS__";

const memoryStore: NormalizedWebhookEvent[] =
  ((globalThis as unknown as Record<string, NormalizedWebhookEvent[]>)[memoryKey] ||= []);

function getRedisUrl(): string {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  );
}

function getRedisToken(): string {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );
}

function hasRedis(): boolean {
  return Boolean(getRedisUrl() && getRedisToken());
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function truncateText(value: unknown, maxLength = 1200): string | null {
  const text = safeString(value, "");

  if (!text) return null;
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength)}…`;
}

function compactNested(value: unknown, maxJsonLength = 2500): unknown {
  if (value === null || value === undefined) return null;

  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  const json = safeJson(value);

  if (json.length <= maxJsonLength) {
    return value;
  }

  return {
    truncated: true,
    originalBytesApprox: json.length,
    preview: json.slice(0, maxJsonLength)
  };
}

function compactPayloadFromEvent(event: NormalizedWebhookEvent): AnyRecord {
  const payload = isRecord(event.payload) ? event.payload : {};

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    action: event.action,
    source: event.source,
    strategyVersion: event.strategyVersion,
    runId: event.runId,
    tradeId: event.tradeId,

    symbol: event.symbol,
    side: event.side,
    reason: event.reason,
    cohortKey: event.cohortKey,

    setupClass: event.setupClass,
    grade: event.grade,

    ts: event.ts,
    receivedAt: event.receivedAt,

    score: event.score,
    confluence: event.confluence,
    sniperScore: event.sniperScore,

    rsi: event.rsi,
    rsiHTF: event.rsiHTF,
    rsiZone: event.rsiZone,

    obBias: event.obBias,
    spreadPct: event.spreadPct,
    depthMinUsd1p: event.depthMinUsd1p,

    entry: event.entry,
    sl: event.sl,
    initialSl: event.initialSl,
    tp: event.tp,
    exit: event.exit,

    rr: event.rr,
    plannedRR: event.plannedRR,
    baseRR: event.baseRR,
    finalRr: event.finalRr,
    exitR: event.exitR,
    pnlPct: event.pnlPct,

    mfeR: event.mfeR,
    maeR: event.maeR,
    currentR: event.currentR,

    directToSL: event.directToSL,
    nearTpSeen: event.nearTpSeen,
    reachedHalfR: event.reachedHalfR,
    reachedOneR: event.reachedOneR,
    breakEvenActivated: event.breakEvenActivated,
    breakEvenStop: event.breakEvenStop,

    entryReason: payload.entryReason ?? payload.entryType ?? null,
    exitReason: payload.exitReason ?? null,
    flow: payload.flow ?? null,
    regime: payload.regime ?? null,
    btcState: payload.btcState ?? null,
    rsiEdge: payload.rsiEdge ?? payload.rsiEntryEdge ?? null,
    obRelation: payload.obRelation ?? null,
    spreadBucket: payload.spreadBucket ?? null,
    depthBucket: payload.depthBucket ?? null,

    stage: payload.stage ?? null,
    scannerStage: payload.scannerStage ?? null,
    stageSource: payload.stageSource ?? null,

    filterValues: compactNested(payload.filterValues),
    filterChecks: compactNested(payload.filterChecks),
    filterDiagnostics: compactNested(payload.filterDiagnostics),
    liveFilterMetrics: compactNested(payload.liveFilterMetrics),
    specialFilterChecks: compactNested(payload.specialFilterChecks),

    rawPreview: truncateText(event.rawJson, 1200)
  };
}

function compactTradeEvent(event: NormalizedWebhookEvent): NormalizedWebhookEvent {
  const compactPayload = compactPayloadFromEvent(event);
  const compactJson = safeJson(compactPayload);

  return {
    ...event,
    payload: compactPayload,
    rawJson: compactJson,
    payloadJson: compactJson
  };
}

function isMaxRequestSizeError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : safeString(error, "");

  const text = message.toLowerCase();

  return (
    text.includes("max request size") ||
    text.includes("request size exceeded") ||
    text.includes("max_request_size_exceeded")
  );
}

async function redisCommand<T = unknown>(command: RedisCommand): Promise<T> {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("REDIS_ENV_MISSING");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  });

  const text = await res.text();

  let json: { result?: T; error?: string } | null = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok || json?.error) {
    throw new Error(json?.error || text.slice(0, 500) || `REDIS_ERROR_${res.status}`);
  }

  return json?.result as T;
}

function parseStoredEvent(value: unknown): NormalizedWebhookEvent | null {
  if (!value) return null;

  if (isRecord(value)) {
    return compactTradeEvent(value as NormalizedWebhookEvent);
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (!isRecord(parsed)) {
      return null;
    }

    return compactTradeEvent(parsed as NormalizedWebhookEvent);
  } catch {
    return null;
  }
}

function sortEventsAsc(events: NormalizedWebhookEvent[]): NormalizedWebhookEvent[] {
  return [...events].sort((a, b) => {
    const tsDiff = Number(a.ts || 0) - Number(b.ts || 0);
    if (tsDiff !== 0) return tsDiff;

    return String(a.eventId || "").localeCompare(String(b.eventId || ""));
  });
}

function saveMemoryEvent(event: NormalizedWebhookEvent): SaveTradeEventResult {
  const compactEvent = compactTradeEvent(event);
  const exists = memoryStore.some(row => row.eventId === compactEvent.eventId);

  if (exists) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: false,
      key: "memory",
      eventId: compactEvent.eventId,
      count: memoryStore.length
    };
  }

  memoryStore.push(compactEvent);

  if (memoryStore.length > TRADE_EVENTS_MAX_ROWS) {
    memoryStore.splice(0, memoryStore.length - TRADE_EVENTS_MAX_ROWS);
  }

  return {
    ok: true,
    stored: true,
    deduped: false,
    persistent: false,
    key: "memory",
    eventId: compactEvent.eventId,
    count: memoryStore.length
  };
}

async function readRedisEventsTail(): Promise<NormalizedWebhookEvent[]> {
  const totalRaw = await redisCommand<number>([
    "LLEN",
    TRADE_EVENTS_KEY
  ]);

  const total = Number(totalRaw || 0);

  if (!total) {
    return [];
  }

  const wanted = Math.min(total, TRADE_EVENTS_READ_ROWS);
  const batches: string[][] = [];

  let end = total - 1;
  let loaded = 0;
  let chunkSize = Math.min(TRADE_EVENTS_READ_CHUNK, wanted);

  while (end >= 0 && loaded < wanted) {
    const remaining = wanted - loaded;
    const take = Math.min(chunkSize, remaining, end + 1);
    const start = Math.max(0, end - take + 1);

    try {
      const rows = await redisCommand<string[]>([
        "LRANGE",
        TRADE_EVENTS_KEY,
        start,
        end
      ]);

      const safeRows = Array.isArray(rows) ? rows : [];

      batches.unshift(safeRows);

      loaded += safeRows.length;
      end = start - 1;

      if (chunkSize < TRADE_EVENTS_READ_CHUNK) {
        chunkSize = Math.min(TRADE_EVENTS_READ_CHUNK, chunkSize * 2);
      }

      continue;
    } catch (error) {
      if (isMaxRequestSizeError(error) && take > 1) {
        chunkSize = Math.max(1, Math.floor(take / 2));

        console.warn("TRADE_EVENT_READ_CHUNK_TOO_LARGE_RETRYING:", {
          start,
          end,
          take,
          nextChunkSize: chunkSize
        });

        continue;
      }

      if (isMaxRequestSizeError(error) && take <= 1) {
        console.warn("TRADE_EVENT_SINGLE_ROW_TOO_LARGE_SKIPPED:", {
          index: end,
          error: error instanceof Error ? error.message : safeString(error)
        });

        end = start - 1;
        loaded += 1;
        continue;
      }

      throw error;
    }
  }

  return sortEventsAsc(
    batches
      .flat()
      .map(parseStoredEvent)
      .filter(Boolean) as NormalizedWebhookEvent[]
  );
}

export async function saveTradeEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  if (!event?.eventId) {
    throw new Error("TRADE_EVENT_EVENT_ID_MISSING");
  }

  const compactEvent = compactTradeEvent(event);

  if (!hasRedis()) {
    console.warn("TRADE_EVENT_STORE_USING_MEMORY_FALLBACK:", {
      reason: "Redis env missing",
      eventId: compactEvent.eventId
    });

    return saveMemoryEvent(compactEvent);
  }

  const existing = await redisCommand<string | null>([
    "HGET",
    TRADE_DEDUPE_KEY,
    compactEvent.eventId
  ]);

  if (existing) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: true,
      key: TRADE_EVENTS_KEY,
      eventId: compactEvent.eventId,
      count: null
    };
  }

  const storedEvent = {
    ...compactEvent,
    storedAt: Date.now()
  };

  await redisCommand([
    "HSET",
    TRADE_DEDUPE_KEY,
    compactEvent.eventId,
    String(Date.now())
  ]);

  const count = await redisCommand<number>([
    "RPUSH",
    TRADE_EVENTS_KEY,
    safeJson(storedEvent)
  ]);

  await redisCommand([
    "LTRIM",
    TRADE_EVENTS_KEY,
    -TRADE_EVENTS_MAX_ROWS,
    -1
  ]);

  return {
    ok: true,
    stored: true,
    deduped: false,
    persistent: true,
    key: TRADE_EVENTS_KEY,
    eventId: compactEvent.eventId,
    count
  };
}

export async function listTradeEvents(): Promise<NormalizedWebhookEvent[]> {
  if (!hasRedis()) {
    return sortEventsAsc(memoryStore.map(compactTradeEvent));
  }

  return readRedisEventsTail();
}

export async function getTradeEvents(): Promise<NormalizedWebhookEvent[]> {
  return listTradeEvents();
}

export async function getTradeEventCount(): Promise<number> {
  if (!hasRedis()) return memoryStore.length;

  const count = await redisCommand<number>([
    "LLEN",
    TRADE_EVENTS_KEY
  ]);

  return Number(count || 0);
}

export async function clearTradeEventsForDebugOnly(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  if (!hasRedis()) {
    memoryStore.length = 0;

    return {
      ok: true,
      persistent: false
    };
  }

  await redisCommand(["DEL", TRADE_EVENTS_KEY]);
  await redisCommand(["DEL", TRADE_DEDUPE_KEY]);

  return {
    ok: true,
    persistent: true
  };
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  return clearTradeEventsForDebugOnly();
}