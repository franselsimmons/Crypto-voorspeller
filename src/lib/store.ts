import type { NormalizedWebhookEvent, WebhookRecord } from "./normalize";

type RedisCommand = Array<string | number>;

export type TradeEvent = NormalizedWebhookEvent & {
  storedAt?: number;
  payloadHash?: string | null;

  entryReason?: string | null;
  exitReason?: string | null;
  rejectReason?: string | null;

  gradePoints?: number | null;
  recommendedRisk?: string | null;

  rsiEdge?: string | null;
  btcState?: string | null;
  regime?: string | null;
  flow?: string | null;

  obRelation?: string | null;
  spreadBps?: number | null;
  spreadBucket?: string | null;
  depthBucket?: string | null;

  triggerR?: number | null;
  triggerPnlPct?: number | null;
  maxTpProgress?: number | null;
  maxSlProgress?: number | null;

  ticksObserved?: number | null;
  favorableTicks?: number | null;
  adverseTicks?: number | null;
  neutralTicks?: number | null;

  open?: boolean;
  status?: string | null;

  [key: string]: unknown;
};

export type SaveTradeEventResult = {
  ok: boolean;
  stored: boolean;
  deduped: boolean;
  persistent: boolean;
  key: string;
  eventId: string;
  count?: number | null;
  reason?: string | null;
  error?: string | null;
};

type RedisConfig = {
  restUrl: string;
  token: string;
  urlSource: string;
  tokenSource: string;
};

type ListTradeEventsOptions = {
  limit?: number;
};

const TRADE_EVENTS_KEY =
  process.env.TRADE_EVENTS_KEY || "tradesystem:events:v1";

const TRADE_DEDUPE_KEY =
  process.env.TRADE_DEDUPE_KEY || "tradesystem:events:dedupe:v1";

const TRADE_EVENTS_MAX_ROWS = clampInt(
  process.env.TRADE_EVENTS_MAX_ROWS,
  1000,
  25000,
  7500
);

const TRADE_EVENTS_READ_LIMIT = clampInt(
  process.env.TRADE_EVENTS_READ_LIMIT,
  100,
  5000,
  1500
);

const TRADE_EVENTS_READ_CHUNK = clampInt(
  process.env.TRADE_EVENTS_READ_CHUNK,
  10,
  250,
  75
);

const ALLOW_MEMORY_STORE =
  process.env.ALLOW_MEMORY_TRADE_STORE === "true" ||
  process.env.NODE_ENV !== "production";

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS_V2__";

const globalMemory = globalThis as unknown as Record<string, TradeEvent[]>;

const memoryStore: TradeEvent[] = (globalMemory[memoryKey] ||= []);

let loggedStoreMode = false;

function clampInt(
  value: string | number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);

  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;

  return Math.floor(n);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function firstEnv(names: string[]): { value: string; name: string } | null {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim()) {
      return {
        value: value.trim(),
        name
      };
    }
  }

  return null;
}

function deriveRestUrlFromRedisUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);

    if (!["redis:", "rediss:"].includes(url.protocol)) {
      return null;
    }

    if (!url.hostname) return null;

    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}

function deriveTokenFromRedisUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const password = url.password ? decodeURIComponent(url.password) : "";

    return password || null;
  } catch {
    return null;
  }
}

function normalizeRestUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;

  const value = rawUrl.trim();

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return cleanUrl(value);
  }

  return deriveRestUrlFromRedisUrl(value);
}

function getRedisConfig(): RedisConfig | null {
  const directUrl = firstEnv([
    "KV_REST_API_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REST_URL"
  ]);

  const directToken = firstEnv([
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_TOKEN",
    "UPSTASH_REST_TOKEN"
  ]);

  const redisUrl = firstEnv([
    "KV_URL",
    "REDIS_URL",
    "UPSTASH_REDIS_URL"
  ]);

  if (directUrl) {
    const restUrl = normalizeRestUrl(directUrl.value);
    const token = directToken?.value || (redisUrl ? deriveTokenFromRedisUrl(redisUrl.value) : null);

    if (restUrl && token) {
      return {
        restUrl,
        token,
        urlSource: directUrl.name,
        tokenSource: directToken?.name || redisUrl?.name || "derived"
      };
    }
  }

  if (redisUrl) {
    const restUrl = deriveRestUrlFromRedisUrl(redisUrl.value);
    const token = directToken?.value || deriveTokenFromRedisUrl(redisUrl.value);

    if (restUrl && token) {
      return {
        restUrl,
        token,
        urlSource: `${redisUrl.name}:derived-rest-url`,
        tokenSource: directToken?.name || `${redisUrl.name}:password`
      };
    }
  }

  return null;
}

function logStoreMode(config: RedisConfig | null): void {
  if (loggedStoreMode) return;

  loggedStoreMode = true;

  console.log("TRADE_EVENT_STORE_MODE:", JSON.stringify({
    mode: config ? "redis" : "memory",
    nodeEnv: process.env.NODE_ENV,
    persistent: Boolean(config),
    allowMemoryStore: ALLOW_MEMORY_STORE,
    key: TRADE_EVENTS_KEY,
    dedupeKey: TRADE_DEDUPE_KEY,
    maxRows: TRADE_EVENTS_MAX_ROWS,
    readLimit: TRADE_EVENTS_READ_LIMIT,
    readChunk: TRADE_EVENTS_READ_CHUNK,
    urlSource: config?.urlSource || null,
    tokenSource: config?.tokenSource || null,
    envSeen: {
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
      KV_URL: Boolean(process.env.KV_URL),
      REDIS_URL: Boolean(process.env.REDIS_URL),
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    }
  }));
}

async function redisCommand<T = unknown>(command: RedisCommand): Promise<T> {
  const config = getRedisConfig();

  logStoreMode(config);

  if (!config) {
    throw new Error("REDIS_REST_CONFIG_MISSING");
  }

  const res = await fetch(config.restUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
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
    const message =
      json?.error ||
      text.slice(0, 1000) ||
      `REDIS_ERROR_${res.status}`;

    throw new Error(message);
  }

  return json?.result as T;
}

function readPath(obj: unknown, path: string): unknown {
  if (!isRecord(obj)) return undefined;

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }

  return current;
}

function firstValue(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function asString(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function asUpper(value: unknown, fallback = "UNKNOWN"): string {
  return asString(value, fallback).toUpperCase();
}

function asLower(value: unknown, fallback = ""): string {
  return asString(value, fallback).toLowerCase();
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  const text = asLower(value);

  return ["true", "1", "yes", "y"].includes(text);
}

function normalizeStoredEventType(value: unknown): string {
  const raw = asUpper(value, "SNAPSHOT");

  if (raw === "ENTRY") return "ENTRY";
  if (raw === "EXIT") return "EXIT";
  if (raw === "REJECT") return "REJECT";
  if (raw === "WAIT") return "REJECT";
  if (raw === "SKIP") return "REJECT";
  if (raw === "SNAPSHOT") return "SNAPSHOT";
  if (raw === "HOLD") return "SNAPSHOT";
  if (raw === "BATCH") return "BATCH";

  return raw;
}

function isPersistableEventType(eventType: string): boolean {
  return ["ENTRY", "EXIT", "REJECT", "SNAPSHOT"].includes(eventType);
}

function isTooLargeError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error || "");

  return (
    text.includes("max request size exceeded") ||
    text.includes("ERR max request size exceeded") ||
    text.includes("Request Entity Too Large") ||
    text.includes("FUNCTION_PAYLOAD_TOO_LARGE") ||
    text.includes("PAYLOAD_TOO_LARGE")
  );
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `h_${(hash >>> 0).toString(16)}`;
}

function buildLeanPayload(event: TradeEvent): WebhookRecord {
  const payload = isRecord(event.payload) ? event.payload : {};

  const lean: WebhookRecord = {
    entryReason: firstValue(event, ["entryReason", "payload.entryReason", "payload.setup.entryReason"]),
    exitReason: firstValue(event, ["exitReason", "payload.exitReason"]),
    rejectReason: firstValue(event, ["rejectReason", "payload.rejectReason"]),

    gradePoints: firstValue(event, ["gradePoints", "payload.gradePoints", "payload.setup.gradePoints"]),
    recommendedRisk: firstValue(event, ["recommendedRisk", "payload.recommendedRisk"]),

    rsiEdge: firstValue(event, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge", "payload.rsi.rsiEntryEdge"]),

    btcState: firstValue(event, ["btcState", "payload.btcState", "payload.market.btcState"]),
    regime: firstValue(event, ["regime", "payload.regime", "payload.market.regime"]),
    flow: firstValue(event, ["flow", "payload.flow", "payload.market.flow"]),

    obRelation: firstValue(event, ["obRelation", "payload.obRelation", "payload.ob.relation", "payload.orderbook.relation"]),
    spreadBps: firstValue(event, ["spreadBps", "payload.spreadBps", "payload.ob.spreadBps"]),
    spreadBucket: firstValue(event, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"]),
    depthBucket: firstValue(event, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"]),

    triggerR: firstValue(event, ["triggerR", "payload.triggerR"]),
    triggerPnlPct: firstValue(event, ["triggerPnlPct", "payload.triggerPnlPct"]),
    maxTpProgress: firstValue(event, ["maxTpProgress", "payload.maxTpProgress"]),
    maxSlProgress: firstValue(event, ["maxSlProgress", "payload.maxSlProgress"]),

    ticksObserved: firstValue(event, ["ticksObserved", "payload.ticksObserved"]),
    favorableTicks: firstValue(event, ["favorableTicks", "payload.favorableTicks"]),
    adverseTicks: firstValue(event, ["adverseTicks", "payload.adverseTicks"]),
    neutralTicks: firstValue(event, ["neutralTicks", "payload.neutralTicks"]),

    status: firstValue(event, ["status", "payload.status"]),
    open: firstValue(event, ["open", "payload.open"]),

    funding: firstValue(event, ["funding", "payload.funding", "payload.market.funding"]),
    fundingBucket: firstValue(event, ["fundingBucket", "payload.fundingBucket", "payload.market.fundingBucket"]),

    stage: firstValue(event, ["stage", "payload.stage"]),
    scannerStage: firstValue(event, ["scannerStage", "payload.scannerStage"]),
    stageSource: firstValue(event, ["stageSource", "payload.stageSource"])
  };

  for (const [key, value] of Object.entries(lean)) {
    if (value === undefined || value === null || value === "") {
      delete lean[key];
    }
  }

  if (isRecord(payload.analytics)) {
    lean.analytics = {
      cohortKey: firstValue(payload, ["analytics.cohortKey"])
    };
  }

  return lean;
}

function compactTradeEvent(input: NormalizedWebhookEvent): TradeEvent {
  const event = input as TradeEvent;
  const eventType = normalizeStoredEventType(event.eventType || event.action);
  const leanPayload = buildLeanPayload(event);

  const entryReason = asUpper(
    firstValue(event, ["entryReason", "payload.entryReason", "payload.setup.entryReason", "reason"]),
    event.reason || "UNKNOWN"
  );

  const exitReason = asUpper(
    firstValue(event, ["exitReason", "payload.exitReason"]),
    ""
  );

  const rejectReason = asUpper(
    firstValue(event, ["rejectReason", "payload.rejectReason"]),
    ""
  );

  const btcState = asUpper(
    firstValue(event, ["btcState", "payload.btcState", "payload.market.btcState"]),
    "UNKNOWN"
  );

  const regime = asUpper(
    firstValue(event, ["regime", "payload.regime", "payload.market.regime"]),
    "UNKNOWN"
  );

  const flow = asUpper(
    firstValue(event, ["flow", "payload.flow", "payload.market.flow"]),
    "UNKNOWN"
  );

  const rsiEdge = asUpper(
    firstValue(event, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge", "payload.rsi.rsiEntryEdge"]),
    "UNKNOWN"
  );

  const obRelation = asUpper(
    firstValue(event, ["obRelation", "payload.obRelation", "payload.ob.relation", "payload.orderbook.relation"]),
    "UNKNOWN"
  );

  const spreadBps =
    asNumber(firstValue(event, ["spreadBps", "payload.spreadBps", "payload.ob.spreadBps"])) ??
    (typeof event.spreadPct === "number" ? event.spreadPct * 10000 : null);

  const spreadBucket = asUpper(
    firstValue(event, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"]),
    spreadBps === null
      ? "SPREAD_NA"
      : spreadBps < 2
        ? "SPREAD_LT_2BPS"
        : spreadBps < 5
          ? "SPREAD_2_5BPS"
          : spreadBps < 8
            ? "SPREAD_5_8BPS"
            : spreadBps < 12
              ? "SPREAD_8_12BPS"
              : spreadBps < 25
                ? "SPREAD_12_25BPS"
                : "SPREAD_GTE_25BPS"
  );

  const depth = asNumber(
    firstValue(event, [
      "depthMinUsd1p",
      "payload.depthMinUsd1p",
      "payload.depthUsd1p",
      "payload.ob.depthMinUsd1p"
    ])
  );

  const depthBucket = asUpper(
    firstValue(event, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"]),
    depth === null
      ? "DEPTH_NA"
      : depth < 50_000
        ? "DEPTH_LT_50K"
        : depth < 100_000
          ? "DEPTH_50K_100K"
          : depth < 200_000
            ? "DEPTH_100K_200K"
            : depth < 500_000
              ? "DEPTH_200K_500K"
              : depth < 1_000_000
                ? "DEPTH_500K_1M"
                : "DEPTH_GTE_1M"
  );

  const compact: TradeEvent = {
    eventId: asString(event.eventId),
    eventType,
    action: eventType,
    source: asUpper(event.source || "TRADESYSTEM", "TRADESYSTEM"),
    strategyVersion: asString(event.strategyVersion || "UNKNOWN", "UNKNOWN"),
    runId: asString(event.runId || "UNKNOWN", "UNKNOWN"),
    tradeId: asString(event.tradeId || "") || null,

    symbol: asUpper(event.symbol || "", "") || null,
    side: asLower(event.side || "", "") || null,
    reason: asUpper(event.reason || entryReason || exitReason || rejectReason || "UNKNOWN", "UNKNOWN"),
    cohortKey: asString(event.cohortKey || "") || null,

    setupClass: asUpper(event.setupClass || "UNKNOWN", "UNKNOWN"),
    grade: asUpper(event.grade || "", "") || null,

    ts: Number(event.ts || Date.now()),
    receivedAt: Number(event.receivedAt || Date.now()),

    score: Number(event.score || 0),
    confluence: Number(event.confluence || 0),
    sniperScore: Number(event.sniperScore || 0),

    rsi: event.rsi ?? null,
    rsiHTF: event.rsiHTF ?? null,
    rsiZone: asUpper(event.rsiZone || "", "") || null,

    obBias: asUpper(event.obBias || "", "") || null,
    spreadPct: event.spreadPct ?? null,
    depthMinUsd1p: event.depthMinUsd1p ?? null,

    entry: event.entry ?? null,
    sl: event.sl ?? null,
    initialSl: event.initialSl ?? null,
    tp: event.tp ?? null,
    exit: event.exit ?? null,

    rr: event.rr ?? null,
    plannedRR: event.plannedRR ?? null,
    baseRR: event.baseRR ?? null,
    finalRr: event.finalRr ?? null,
    exitR: event.exitR ?? null,
    pnlPct: event.pnlPct ?? null,

    mfeR: event.mfeR ?? null,
    maeR: event.maeR ?? null,
    currentR: event.currentR ?? null,

    directToSL: Boolean(event.directToSL),
    nearTpSeen: Boolean(event.nearTpSeen),
    reachedHalfR: Boolean(event.reachedHalfR),
    reachedOneR: Boolean(event.reachedOneR),
    breakEvenActivated: Boolean(event.breakEvenActivated),
    breakEvenStop: Boolean(event.breakEvenStop),

    entryReason,
    exitReason: exitReason || null,
    rejectReason: rejectReason || null,

    gradePoints: asNumber(firstValue(event, ["gradePoints", "payload.gradePoints", "payload.setup.gradePoints"])),
    recommendedRisk: asString(firstValue(event, ["recommendedRisk", "payload.recommendedRisk"]), "") || null,

    rsiEdge,
    btcState,
    regime,
    flow,

    obRelation,
    spreadBps,
    spreadBucket,
    depthBucket,

    triggerR: asNumber(firstValue(event, ["triggerR", "payload.triggerR"])),
    triggerPnlPct: asNumber(firstValue(event, ["triggerPnlPct", "payload.triggerPnlPct"])),
    maxTpProgress: asNumber(firstValue(event, ["maxTpProgress", "payload.maxTpProgress"])),
    maxSlProgress: asNumber(firstValue(event, ["maxSlProgress", "payload.maxSlProgress"])),

    ticksObserved: asNumber(firstValue(event, ["ticksObserved", "payload.ticksObserved"])),
    favorableTicks: asNumber(firstValue(event, ["favorableTicks", "payload.favorableTicks"])),
    adverseTicks: asNumber(firstValue(event, ["adverseTicks", "payload.adverseTicks"])),
    neutralTicks: asNumber(firstValue(event, ["neutralTicks", "payload.neutralTicks"])),

    open: asBoolean(firstValue(event, ["open", "payload.open"])),
    status: asString(firstValue(event, ["status", "payload.status"]), "") || null,

    payload: leanPayload,
    rawJson: "",
    payloadJson: "",
    storedAt: Date.now()
  };

  compact.payloadHash = stableHash(JSON.stringify({
    eventId: compact.eventId,
    eventType: compact.eventType,
    tradeId: compact.tradeId,
    symbol: compact.symbol,
    side: compact.side,
    ts: compact.ts,
    payload: compact.payload
  }));

  return compact;
}

function parseStoredEvent(value: unknown): TradeEvent | null {
  if (!value) return null;

  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) return null;

  const event = parsed as TradeEvent;
  const eventType = normalizeStoredEventType(event.eventType || event.action);

  if (!isPersistableEventType(eventType)) {
    return null;
  }

  if (!event.eventId) return null;

  return compactTradeEvent({
    ...(event as NormalizedWebhookEvent),
    eventType,
    action: eventType
  });
}

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const tsDiff = Number(a.ts || 0) - Number(b.ts || 0);
    if (tsDiff !== 0) return tsDiff;

    return String(a.eventId || "").localeCompare(String(b.eventId || ""));
  });
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
      count: memoryStore.length,
      reason: "DUPLICATE_EVENT_ID"
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
    count: memoryStore.length,
    reason: null
  };
}

async function readRedisRangeSafe(start: number, end: number): Promise<string[]> {
  if (start > end) return [];

  try {
    const rows = await redisCommand<string[]>([
      "LRANGE",
      TRADE_EVENTS_KEY,
      start,
      end
    ]);

    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (!isTooLargeError(error)) {
      throw error;
    }

    if (start === end) {
      console.warn("TRADE_EVENT_STORE_SKIPPED_OVERSIZED_ROW:", JSON.stringify({
        key: TRADE_EVENTS_KEY,
        index: start,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
      }));

      return [];
    }

    const mid = Math.floor((start + end) / 2);

    const left = await readRedisRangeSafe(start, mid);
    const right = await readRedisRangeSafe(mid + 1, end);

    return [...left, ...right];
  }
}

function normalizeListLimit(options?: number | ListTradeEventsOptions): number {
  if (typeof options === "number") {
    return clampInt(options, 1, 5000, TRADE_EVENTS_READ_LIMIT);
  }

  return clampInt(options?.limit, 1, 5000, TRADE_EVENTS_READ_LIMIT);
}

export async function saveTradeEvent(
  eventInput: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  if (!eventInput?.eventId) {
    throw new Error("TRADE_EVENT_EVENT_ID_MISSING");
  }

  const event = compactTradeEvent(eventInput);
  const eventType = normalizeStoredEventType(event.eventType);

  if (!isPersistableEventType(eventType)) {
    console.warn("TRADE_EVENT_STORE_SKIPPED_UNSUPPORTED:", JSON.stringify({
      eventId: event.eventId,
      eventType,
      action: event.action,
      reason: "BATCH_OR_UNKNOWN_EVENT_TYPE"
    }));

    return {
      ok: true,
      stored: false,
      deduped: false,
      persistent: Boolean(getRedisConfig()),
      key: TRADE_EVENTS_KEY,
      eventId: event.eventId,
      count: null,
      reason: "UNSUPPORTED_EVENT_TYPE"
    };
  }

  const config = getRedisConfig();
  logStoreMode(config);

  if (!config) {
    if (!ALLOW_MEMORY_STORE) {
      throw new Error("PERSISTENT_REDIS_ENV_MISSING");
    }

    console.warn("TRADE_EVENT_STORE_USING_MEMORY_FALLBACK:", JSON.stringify({
      reason: "Redis REST env missing",
      eventId: event.eventId,
      nodeEnv: process.env.NODE_ENV
    }));

    return saveMemoryEvent(event);
  }

  const dedupeResult = await redisCommand<number>([
    "HSETNX",
    TRADE_DEDUPE_KEY,
    event.eventId,
    String(Date.now())
  ]);

  if (Number(dedupeResult) !== 1) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: true,
      key: TRADE_EVENTS_KEY,
      eventId: event.eventId,
      count: null,
      reason: "DUPLICATE_EVENT_ID"
    };
  }

  const json = JSON.stringify(event);

  const countRaw = await redisCommand<number | string>([
    "RPUSH",
    TRADE_EVENTS_KEY,
    json
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
    eventId: event.eventId,
    count: Number(countRaw || 0),
    reason: null
  };
}

export async function listTradeEvents(
  options?: number | ListTradeEventsOptions
): Promise<TradeEvent[]> {
  const limit = normalizeListLimit(options);
  const config = getRedisConfig();

  logStoreMode(config);

  if (!config) {
    if (!ALLOW_MEMORY_STORE) {
      throw new Error("PERSISTENT_REDIS_ENV_MISSING");
    }

    return sortEventsAsc(memoryStore).slice(-limit);
  }

  let total = 0;

  try {
    const countRaw = await redisCommand<number | string>([
      "LLEN",
      TRADE_EVENTS_KEY
    ]);

    total = Number(countRaw || 0);
  } catch (error) {
    console.error("TRADE_EVENT_STORE_COUNT_FAILED:", JSON.stringify({
      key: TRADE_EVENTS_KEY,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    }));

    return [];
  }

  if (!total) return [];

  const collected: TradeEvent[] = [];
  let end = total - 1;

  while (end >= 0 && collected.length < limit) {
    const start = Math.max(0, end - TRADE_EVENTS_READ_CHUNK + 1);

    let rawRows: string[] = [];

    try {
      rawRows = await readRedisRangeSafe(start, end);
    } catch (error) {
      console.error("TRADE_EVENT_STORE_READ_FAILED:", JSON.stringify({
        key: TRADE_EVENTS_KEY,
        start,
        end,
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
      }));

      break;
    }

    for (let i = rawRows.length - 1; i >= 0; i -= 1) {
      const event = parseStoredEvent(rawRows[i]);

      if (!event) continue;

      collected.push(event);

      if (collected.length >= limit) break;
    }

    end = start - 1;
  }

  return sortEventsAsc(collected).slice(-limit);
}

export async function getTradeEventCount(): Promise<number> {
  const config = getRedisConfig();

  logStoreMode(config);

  if (!config) {
    if (!ALLOW_MEMORY_STORE) {
      throw new Error("PERSISTENT_REDIS_ENV_MISSING");
    }

    return memoryStore.length;
  }

  const count = await redisCommand<number | string>([
    "LLEN",
    TRADE_EVENTS_KEY
  ]);

  return Number(count || 0);
}

export async function clearTradeEventsForDebugOnly(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  const config = getRedisConfig();

  logStoreMode(config);

  memoryStore.length = 0;

  if (!config) {
    if (!ALLOW_MEMORY_STORE) {
      throw new Error("PERSISTENT_REDIS_ENV_MISSING");
    }

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

export async function getTradeStoreDiagnostics(): Promise<Record<string, unknown>> {
  const config = getRedisConfig();

  logStoreMode(config);

  let count: number | null = null;
  let error: string | null = null;

  try {
    count = await getTradeEventCount();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    ok: Boolean(config) && !error,
    persistent: Boolean(config),
    mode: config ? "redis" : "memory",
    key: TRADE_EVENTS_KEY,
    dedupeKey: TRADE_DEDUPE_KEY,
    count,
    error,
    nodeEnv: process.env.NODE_ENV,
    allowMemoryStore: ALLOW_MEMORY_STORE,
    maxRows: TRADE_EVENTS_MAX_ROWS,
    readLimit: TRADE_EVENTS_READ_LIMIT,
    readChunk: TRADE_EVENTS_READ_CHUNK,
    urlSource: config?.urlSource || null,
    tokenSource: config?.tokenSource || null,
    envSeen: {
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
      KV_URL: Boolean(process.env.KV_URL),
      REDIS_URL: Boolean(process.env.REDIS_URL),
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    }
  };
}

// Backward-compatible aliases. Laat staan.
export const getTradeEvents = listTradeEvents;
export const clearTradeEvents = clearTradeEventsForDebugOnly;