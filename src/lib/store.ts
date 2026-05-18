import type { NormalizedWebhookEvent } from "./normalize";

export type TradeEvent = NormalizedWebhookEvent & Record<string, unknown>;

type RedisCommand = Array<string | number>;

export type SaveTradeEventResult = {
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
  500,
  Number(process.env.TRADE_EVENTS_MAX_ROWS || 5000)
);

const TRADE_EVENTS_READ_LIMIT = Math.max(
  10,
  Number(process.env.TRADE_EVENTS_READ_LIMIT || 100)
);

const TRADE_EVENTS_READ_LIMIT_MAX = Math.max(
  10,
  Number(process.env.TRADE_EVENTS_READ_LIMIT_MAX || 250)
);

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS__";

const memoryStore: TradeEvent[] =
  ((globalThis as unknown as Record<string, TradeEvent[]>)[memoryKey] ||= []);

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

function isMaxRequestSizeError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error || "");

  return (
    text.includes("max request size exceeded") ||
    text.includes("Request Entity Too Large") ||
    text.includes("FUNCTION_PAYLOAD_TOO_LARGE") ||
    text.includes("PAYLOAD_TOO_LARGE")
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
    throw new Error(json?.error || text.slice(0, 1000) || `REDIS_ERROR_${res.status}`);
  }

  return json?.result as T;
}

function parseStoredEvent(value: unknown): TradeEvent | null {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as TradeEvent;
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as TradeEvent;
  } catch {
    return null;
  }
}

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const tsDiff = Number(a.ts || 0) - Number(b.ts || 0);
    if (tsDiff !== 0) return tsDiff;

    return String(a.eventId || "").localeCompare(String(b.eventId || ""));
  });
}

function trimString(value: unknown, max = 1000): string {
  if (value === null || value === undefined) return "";

  const text = typeof value === "string" ? value : safeJson(value);

  if (text.length <= max) return text;

  return text.slice(0, max);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function compactPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const row = payload as Record<string, unknown>;

  return {
    eventType: row.eventType,
    action: row.action,
    source: row.source,
    strategyVersion: row.strategyVersion,
    runId: row.runId,
    tradeId: row.tradeId,

    symbol: row.symbol,
    rawBitgetSymbol: row.rawBitgetSymbol,
    side: row.side,

    status: row.status,
    open: row.open,

    reason: row.reason,
    entryReason: row.entryReason,
    exitReason: row.exitReason,

    setupClass: row.setupClass,
    grade: row.grade,
    gradePoints: row.gradePoints,
    recommendedRisk: row.recommendedRisk,

    entry: row.entry,
    price: row.price,
    sl: row.sl,
    initialSl: row.initialSl,
    tp: row.tp,
    exit: row.exit,
    executionPrice: row.executionPrice,
    triggerPrice: row.triggerPrice,

    rr: row.rr,
    plannedRR: row.plannedRR,
    baseRR: row.baseRR,
    finalRr: row.finalRr,
    effectiveRR: row.effectiveRR,
    tpRewardMultiplier: row.tpRewardMultiplier,

    exitR: row.exitR,
    pnlPct: row.pnlPct,
    triggerR: row.triggerR,
    triggerPnlPct: row.triggerPnlPct,

    currentR: row.currentR,
    mfeR: row.mfeR,
    maeR: row.maeR,
    maxTpProgress: row.maxTpProgress,
    maxSlProgress: row.maxSlProgress,

    reachedHalfR: row.reachedHalfR,
    reachedOneR: row.reachedOneR,
    nearTpSeen: row.nearTpSeen,
    directToSL: row.directToSL,
    slAfterHalfR: row.slAfterHalfR,
    slAfterOneR: row.slAfterOneR,
    slAfterNearTp: row.slAfterNearTp,

    breakEvenActivated: row.breakEvenActivated,
    breakEvenStop: row.breakEvenStop,
    breakEvenSl: row.breakEvenSl,
    slBeforeBreakEven: row.slBeforeBreakEven,

    ticksObserved: row.ticksObserved,
    favorableTicks: row.favorableTicks,
    adverseTicks: row.adverseTicks,
    neutralTicks: row.neutralTicks,

    score: row.score,
    moveScore: row.moveScore,

    confluence: row.confluence,
    rawConfluence: row.rawConfluence,
    effectiveConfluence: row.effectiveConfluence,

    sniper: row.sniper,
    sniperScore: row.sniperScore,
    rawSniperScore: row.rawSniperScore,
    fallbackSniperScore: row.fallbackSniperScore,

    rsi: row.rsi,
    rsiHTF: row.rsiHTF,
    rsiZone: row.rsiZone,
    rsiEdge: row.rsiEdge,

    obBias: row.obBias,
    obRelation: row.obRelation,
    spreadPct: row.spreadPct,
    spreadBps: row.spreadBps,
    depthMinUsd1p: row.depthMinUsd1p,

    flow: row.flow,
    funding: row.funding,
    regime: row.regime,
    btcState: row.btcState,

    stage: row.stage,
    scannerStage: row.scannerStage,
    stageSource: row.stageSource,

    analysisType: row.analysisType,
    createdAt: row.createdAt,
    ts: row.ts
  };
}

function compactTradeEvent(event: NormalizedWebhookEvent): TradeEvent {
  return {
    ...event,

    payload: compactPayload(event.payload),

    // Belangrijk: oude variant blies Upstash op.
    rawJson: trimString(event.rawJson, 1000),
    payloadJson: trimString(event.payloadJson, 1000)
  };
}

function saveMemoryEvent(event: TradeEvent): SaveTradeEventResult {
  const exists = memoryStore.some(row => row.eventId === event.eventId);

  if (exists) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: false,
      key: "memory",
      eventId: event.eventId,
      count: memoryStore.length
    };
  }

  memoryStore.push(event);

  if (memoryStore.length > TRADE_EVENTS_MAX_ROWS) {
    memoryStore.splice(0, memoryStore.length - TRADE_EVENTS_MAX_ROWS);
  }

  return {
    ok: true,
    stored: true,
    deduped: false,
    persistent: false,
    key: "memory",
    eventId: event.eventId,
    count: memoryStore.length
  };
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

  const storedEvent: TradeEvent = {
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
    JSON.stringify(storedEvent)
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

async function readRedisEventsWithBackoff(limit: number): Promise<TradeEvent[]> {
  let currentLimit = Math.max(1, Math.min(limit, TRADE_EVENTS_READ_LIMIT_MAX));

  while (currentLimit >= 1) {
    try {
      const rows = await redisCommand<string[]>([
        "LRANGE",
        TRADE_EVENTS_KEY,
        -currentLimit,
        -1
      ]);

      const parsed = (Array.isArray(rows) ? rows : [])
        .map(parseStoredEvent)
        .filter(Boolean) as TradeEvent[];

      return sortEventsAsc(parsed);
    } catch (error) {
      if (!isMaxRequestSizeError(error)) {
        throw error;
      }

      console.warn("TRADE_EVENT_READ_LIMIT_REDUCED:", {
        reason: "UPSTASH_MAX_REQUEST_SIZE",
        previousLimit: currentLimit,
        nextLimit: Math.floor(currentLimit / 2)
      });

      currentLimit = Math.floor(currentLimit / 2);
    }
  }

  console.warn("TRADE_EVENT_READ_SKIPPED:", {
    reason: "UPSTASH_ROWS_TOO_LARGE_EVEN_AT_LIMIT_1"
  });

  return [];
}

export async function listTradeEvents(
  limit = TRADE_EVENTS_READ_LIMIT
): Promise<TradeEvent[]> {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit || TRADE_EVENTS_READ_LIMIT), TRADE_EVENTS_READ_LIMIT_MAX)
  );

  if (!hasRedis()) {
    return sortEventsAsc(memoryStore.slice(-safeLimit));
  }

  return readRedisEventsWithBackoff(safeLimit);
}

export async function getTradeEvents(
  limit = TRADE_EVENTS_READ_LIMIT
): Promise<TradeEvent[]> {
  return listTradeEvents(limit);
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