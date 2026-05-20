import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type AnyRecord = Record<string, any>;

const WEBHOOK_SECRET =
  process.env.ANALYSIS_WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "090117";

const MAX_STORED_ACTIONS = Number(process.env.MAX_STORED_ACTIONS || 5000);
const MAX_BATCH_ACTIONS = Number(process.env.MAX_WEBHOOK_BATCH_ACTIONS || 250);
const MAX_EVENT_BYTES = Number(process.env.MAX_WEBHOOK_EVENT_BYTES || 80_000);
const MAX_LATEST_ACTIONS = Number(process.env.MAX_LATEST_ACTIONS || 50);

const LATEST_KEYS = [
  "tradesystem:analysis:latest",
  "analysis:latest",
  "ts:latest"
];

const ACTION_LIST_KEYS = [
  "tradesystem:analysis:actions:list",
  "analysis:actions:list",
  "ts:actions:list"
];

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

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result || fallback;
}

function upper(value: unknown, fallback = ""): string {
  return text(value, fallback).toUpperCase();
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

function firstValue(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function safeJsonParse(value: unknown): any {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function jsonByteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

async function redisCommand(command: unknown[], timeoutMs = 10_000): Promise<any> {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("redis_env_missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command),
      signal: controller.signal
    });

    const responseText = await res.text();

    let json: any = null;

    try {
      json = JSON.parse(responseText);
    } catch {
      json = null;
    }

    if (!res.ok || json?.error) {
      throw new Error(json?.error || responseText || `redis_error_${res.status}`);
    }

    return json?.result;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("redis_fetch_aborted");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function redisSetJson(key: string, value: unknown): Promise<any> {
  return redisCommand(["SET", key, JSON.stringify(value)]);
}

function normalizeEventType(raw: unknown): string {
  const value = upper(raw, "SNAPSHOT");

  if (value.includes("ENTRY")) return "ENTRY";
  if (value.includes("ENTER")) return "ENTRY";
  if (value === "OPEN") return "ENTRY";
  if (value.includes("OPEN_TRADE")) return "ENTRY";

  if (value.includes("EXIT")) return "EXIT";
  if (value.includes("CLOSE")) return "EXIT";
  if (value.includes("CLOSED")) return "EXIT";

  if (value.includes("REJECT")) return "REJECT";
  if (value.includes("WAIT")) return "REJECT";
  if (value.includes("SKIP")) return "REJECT";
  if (value.includes("FILTER_FAIL")) return "REJECT";

  if (value.includes("HOLD")) return "HOLD";
  if (value.includes("SNAPSHOT")) return "SNAPSHOT";

  return value || "SNAPSHOT";
}

function normalizeSide(raw: unknown): string | null {
  const value = upper(raw);

  if (!value) return null;
  if (["BULL", "LONG", "BUY", "BULLISH"].includes(value)) return "LONG";
  if (["BEAR", "SHORT", "SELL", "BEARISH"].includes(value)) return "SHORT";

  return value;
}

function buildFallbackEventId(action: AnyRecord, receivedAt: number): string {
  const eventType = normalizeEventType(
    firstValue(action, ["eventType", "type", "action", "payload.eventType", "payload.type"])
  );

  const symbol = text(firstValue(action, ["symbol", "payload.symbol"]), "UNKNOWN");
  const side = text(firstValue(action, ["side", "payload.side"]), "UNKNOWN");
  const tradeId = text(firstValue(action, ["tradeId", "id", "signalId", "payload.tradeId", "payload.id"]));
  const reason = text(firstValue(action, ["reason", "entryReason", "exitReason", "rejectReason", "payload.reason"]), "UNKNOWN");
  const ts = text(firstValue(action, ["ts", "createdAt", "payload.ts", "payload.createdAt"]), String(receivedAt));

  return [
    "ts",
    eventType,
    symbol,
    side,
    reason,
    tradeId,
    ts
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 260);
}

function extractActions(body: any): AnyRecord[] {
  if (Array.isArray(body)) return body.filter(isRecord);

  if (Array.isArray(body?.actions)) return body.actions.filter(isRecord);
  if (Array.isArray(body?.events)) return body.events.filter(isRecord);
  if (Array.isArray(body?.data)) return body.data.filter(isRecord);
  if (Array.isArray(body?.trades)) return body.trades.filter(isRecord);
  if (Array.isArray(body?.payload?.actions)) return body.payload.actions.filter(isRecord);
  if (Array.isArray(body?.payload?.events)) return body.payload.events.filter(isRecord);

  if (
    body?.action ||
    body?.eventType ||
    body?.type ||
    body?.tradeId ||
    body?.symbol
  ) {
    return isRecord(body) ? [body] : [];
  }

  return [];
}

function shouldDropKey(key: string): boolean {
  const k = key.toLowerCase();

  if (["rawjson", "payloadjson", "rawbody", "bodytext"].includes(k)) return true;
  if (["request", "response", "headers", "cookies"].includes(k)) return true;

  if (process.env.STORE_DEBUG_FIELDS === "1") return false;

  return [
    "filterdiagnostics",
    "filtervalues",
    "filterchecks",
    "livefiltermetrics",
    "specialfilterchecks",
    "debug",
    "debuglog"
  ].includes(k);
}

function compactValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[MaxDepth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (value.length > 20_000) return `${value.slice(0, 20_000)}...[truncated]`;
    return value;
  }

  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 1000).map(item => compactValue(item, depth + 1));
  }

  if (!isRecord(value)) return value;

  const output: AnyRecord = {};

  for (const [key, nested] of Object.entries(value)) {
    if (shouldDropKey(key)) continue;
    output[key] = compactValue(nested, depth + 1);
  }

  return output;
}

function normalizeAction(action: AnyRecord, meta: AnyRecord): AnyRecord {
  const receivedAt = Date.now();

  const eventType = normalizeEventType(
    firstValue(action, [
      "eventType",
      "type",
      "action",
      "payload.eventType",
      "payload.type",
      "payload.action"
    ])
  );

  const eventId =
    text(firstValue(action, ["eventId", "payload.eventId"])) ||
    buildFallbackEventId(action, receivedAt);

  const tradeId =
    text(firstValue(action, ["tradeId", "id", "signalId", "payload.tradeId", "payload.id"])) ||
    eventId;

  const runId =
    text(meta.runId) ||
    text(firstValue(action, ["runId", "payload.runId"])) ||
    null;

  const strategyVersion =
    text(meta.strategyVersion) ||
    text(firstValue(action, ["strategyVersion", "payload.strategyVersion"])) ||
    null;

  const btcState =
    text(meta.btcState) ||
    text(firstValue(action, ["btcState", "payload.btcState", "market.btcState"])) ||
    null;

  const discoveryMode =
    meta.discoveryMode ??
    firstValue(action, ["discoveryMode", "payload.discoveryMode"], null);

  return {
    ...action,
    eventId,
    eventType,
    action: eventType,
    tradeId,
    receivedAt,
    runId,
    strategyVersion,
    btcState,
    discoveryMode,
    side: normalizeSide(firstValue(action, ["side", "payload.side"])) || firstValue(action, ["side", "payload.side"], null)
  };
}

function serializeForStorage(action: AnyRecord): string {
  const compact = compactValue(action) as AnyRecord;

  let json = JSON.stringify(compact);

  if (new TextEncoder().encode(json).length <= MAX_EVENT_BYTES) {
    return json;
  }

  const smaller: AnyRecord = {
    ...compact,
    payload: undefined,
    filterSnapshot: compact.filterSnapshot,
    payloadOmitted: true,
    omitReason: "event_too_large"
  };

  json = JSON.stringify(smaller);

  if (new TextEncoder().encode(json).length <= MAX_EVENT_BYTES) {
    return json;
  }

  const minimal: AnyRecord = {
    eventId: compact.eventId,
    eventType: compact.eventType,
    action: compact.action,
    tradeId: compact.tradeId,
    symbol: compact.symbol,
    side: compact.side,
    reason: compact.reason,
    entryReason: compact.entryReason,
    exitReason: compact.exitReason,
    rejectReason: compact.rejectReason,
    setupClass: compact.setupClass,
    grade: compact.grade,
    entry: compact.entry,
    sl: compact.sl,
    tp: compact.tp,
    exit: compact.exit,
    exitR: compact.exitR,
    pnlPct: compact.pnlPct,
    runId: compact.runId,
    strategyVersion: compact.strategyVersion,
    btcState: compact.btcState,
    receivedAt: compact.receivedAt,
    ts: compact.ts,
    createdAt: compact.createdAt,
    payloadOmitted: true,
    omitReason: "event_too_large_minimal"
  };

  return JSON.stringify(minimal);
}

async function appendSerializedActionsToList(
  key: string,
  serializedActions: string[]
): Promise<void> {
  if (!serializedActions.length) return;

  const chunkSize = 25;

  for (let i = 0; i < serializedActions.length; i += chunkSize) {
    const chunk = serializedActions.slice(i, i + chunkSize);
    await redisCommand(["RPUSH", key, ...chunk], 12_000);
  }

  await redisCommand(["LTRIM", key, -MAX_STORED_ACTIONS, -1], 12_000);
}

function checkSecret(req: NextRequest): boolean {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");

  return urlSecret === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET;
}

function buildMeta(body: any): AnyRecord {
  return {
    runId: body?.runId || body?.meta?.runId || null,
    btcState: body?.btcState || body?.meta?.btcState || null,
    strategyVersion: body?.strategyVersion || body?.meta?.strategyVersion || null,
    discoveryMode: body?.discoveryMode ?? body?.meta?.discoveryMode ?? null
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkSecret(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    route: "app-api-webhooks-tradesystem-online",
    storage: "redis-list",
    redis: hasRedis(),
    maxStoredActions: MAX_STORED_ACTIONS,
    ts: Date.now()
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    if (!checkSecret(req)) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    if (!hasRedis()) {
      return NextResponse.json(
        {
          ok: false,
          error: "redis_env_missing",
          route: "app-api-webhooks-tradesystem-online"
        },
        { status: 500 }
      );
    }

    const rawText = await req.text();

    if (!rawText) {
      return NextResponse.json(
        { ok: false, error: "empty_body" },
        { status: 400 }
      );
    }

    const body = safeJsonParse(rawText);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const extractedActions = extractActions(body);

    if (extractedActions.length > MAX_BATCH_ACTIONS) {
      return NextResponse.json(
        {
          ok: false,
          error: "batch_too_large",
          count: extractedActions.length,
          maxBatchActions: MAX_BATCH_ACTIONS
        },
        { status: 413 }
      );
    }

    const meta = buildMeta(body);

    const normalizedActions = extractedActions.map(action =>
      normalizeAction(action, meta)
    );

    const serializedActions = normalizedActions.map(serializeForStorage);

    const storedActions = serializedActions
      .map(item => safeJsonParse(item))
      .filter(Boolean);

    const latestPayload = {
      ok: true,
      route: "app-api-webhooks-tradesystem-online",
      storage: "redis-list",
      receivedAt: Date.now(),
      count: storedActions.length,
      meta,
      actions: storedActions.slice(-MAX_LATEST_ACTIONS),
      rawKeys: Object.keys(body || {}),
      requestBytes: new TextEncoder().encode(rawText).length,
      storedBatchBytes: serializedActions.reduce(
        (sum, item) => sum + new TextEncoder().encode(item).length,
        0
      )
    };

    await Promise.all(
      LATEST_KEYS.map(key => redisSetJson(key, latestPayload))
    );

    await Promise.all(
      ACTION_LIST_KEYS.map(key =>
        appendSerializedActionsToList(key, serializedActions)
      )
    );

    return NextResponse.json({
      ok: true,
      route: "app-api-webhooks-tradesystem-online",
      storage: "redis-list",
      received: storedActions.length,
      persistent: true,
      redis: true,
      requestBytes: latestPayload.requestBytes,
      storedBatchBytes: latestPayload.storedBatchBytes,
      latestPayloadBytes: jsonByteSize(latestPayload),
      tookMs: Date.now() - startedAt,
      ts: Date.now()
    });
  } catch (error: any) {
    console.error("TRADESYSTEM_WEBHOOK_POST_FAILED", {
      error: error?.message || String(error),
      stack: error?.stack,
      tookMs: Date.now() - startedAt
    });

    return NextResponse.json(
      {
        ok: false,
        route: "app-api-webhooks-tradesystem-online",
        error: error?.message || "webhook_failed",
        tookMs: Date.now() - startedAt,
        ts: Date.now()
      },
      { status: 500 }
    );
  }
}