import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET =
  process.env.ANALYSIS_WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "090117";

const MAX_STORED_ACTIONS = 5000;

const LATEST_KEYS = [
  "tradesystem:analysis:latest",
  "analysis:latest",
  "ts:latest"
];

const ACTION_KEYS = [
  "tradesystem:analysis:actions",
  "analysis:actions",
  "ts:actions"
];

function getRedisUrl() {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  );
}

function getRedisToken() {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );
}

function hasRedis() {
  return Boolean(getRedisUrl() && getRedisToken());
}

async function redisCommand(command: unknown[]) {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("redis_env_missing");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const text = await res.text();

  let json: any = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok || json?.error) {
    throw new Error(json?.error || text || `redis_error_${res.status}`);
  }

  return json?.result;
}

function safeJsonParse(value: unknown) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function redisGetJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await redisCommand(["GET", key]).catch(() => null);
  const parsed = safeJsonParse(raw);

  return parsed ?? fallback;
}

async function redisSetJson(key: string, value: unknown) {
  return redisCommand(["SET", key, JSON.stringify(value)]);
}

function extractActions(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.actions)) return body.actions;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.payload?.actions)) return body.payload.actions;

  // Voor losse ENTRY/EXIT payloads vanuit tradeSystem.js
  if (body?.action || body?.eventType) return [body];

  return [];
}

function normalizeAction(action: any, meta: any) {
  return {
    ...action,
    receivedAt: Date.now(),
    runId: meta?.runId || action?.runId || null,
    strategyVersion: meta?.strategyVersion || action?.strategyVersion || null,
    btcState: meta?.btcState || action?.btcState || null
  };
}

function checkSecret(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");

  return urlSecret === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    route: "app-api-webhooks-tradesystem-online",
    redis: hasRedis(),
    ts: Date.now()
  });
}

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const actions = extractActions(body);
  const meta = {
    runId: body?.runId || body?.meta?.runId || null,
    btcState: body?.btcState || body?.meta?.btcState || null,
    strategyVersion: body?.strategyVersion || body?.meta?.strategyVersion || null,
    discoveryMode: body?.discoveryMode ?? body?.meta?.discoveryMode ?? null
  };

  const normalizedActions = actions.map((action: any) =>
  normalizeAction(action, meta)
);

  const latestPayload = {
    ok: true,
    route: "app-api-webhooks-tradesystem-online",
    receivedAt: Date.now(),
    count: normalizedActions.length,
    meta,
    actions: normalizedActions,
    rawKeys: Object.keys(body || {})
  };

  const previousActions = await redisGetJson<any[]>(ACTION_KEYS[0], []);
  const mergedActions = [
    ...previousActions,
    ...normalizedActions
  ].slice(-MAX_STORED_ACTIONS);

  await Promise.all([
    ...LATEST_KEYS.map(key => redisSetJson(key, latestPayload)),
    ...ACTION_KEYS.map(key => redisSetJson(key, mergedActions))
  ]);

  return NextResponse.json({
    ok: true,
    route: "app-api-webhooks-tradesystem-online",
    received: normalizedActions.length,
    storedTotal: mergedActions.length,
    persistent: true,
    redis: true,
    ts: Date.now()
  });
}