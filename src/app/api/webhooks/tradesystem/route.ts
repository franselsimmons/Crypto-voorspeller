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

type WebhookMeta = {
  runId: string | null;
  btcState: string | null;
  strategyVersion: string | null;
  discoveryMode: unknown;
};

type TradeAction = Record<string, any>;

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

async function redisCommand(command: unknown[]): Promise<any> {
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

function safeJsonParse(value: unknown): any {
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

async function redisGetFirstJson<T>(keys: string[], fallback: T): Promise<T> {
  for (const key of keys) {
    const value = await redisGetJson<T | null>(key, null);

    if (value !== null && value !== undefined) {
      return value as T;
    }
  }

  return fallback;
}

async function redisSetJson(key: string, value: unknown): Promise<any> {
  return redisCommand(["SET", key, JSON.stringify(value)]);
}

function extractActions(body: any): TradeAction[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.actions)) return body.actions;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.payload?.actions)) return body.payload.actions;

  // Losse ENTRY/EXIT payload vanuit tradeSystem.js
  if (body?.action || body?.eventType) return [body];

  return [];
}

function normalizeAction(action: TradeAction, meta: WebhookMeta): TradeAction {
  return {
    ...action,
    receivedAt: Date.now(),
    runId: meta.runId || action?.runId || null,
    strategyVersion: meta.strategyVersion || action?.strategyVersion || null,
    btcState: meta.btcState || action?.btcState || null,
    discoveryMode: meta.discoveryMode ?? action?.discoveryMode ?? null
  };
}

function checkSecret(req: NextRequest): boolean {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");

  return urlSecret === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET;
}

function asArray(value: unknown): TradeAction[] {
  return Array.isArray(value) ? value : [];
}

function getActionType(row: TradeAction): string {
  return String(row?.action || row?.eventType || "UNKNOWN").toUpperCase();
}

function getNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function countBy(
  rows: TradeAction[],
  getter: (row: TradeAction) => string
): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = getter(row) || "UNKNOWN";
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildFrontendStats(actions: TradeAction[], latest: any) {
  const rows = actions.length ? actions : asArray(latest?.actions);

  const entries = rows.filter(row => getActionType(row) === "ENTRY");
  const exits = rows.filter(row => getActionType(row) === "EXIT");
  const waits = rows.filter(row => getActionType(row) === "WAIT");
  const holds = rows.filter(row => getActionType(row) === "HOLD");

  const wins = exits.filter(row => getNumber(row?.exitR) > 0).length;
  const losses = exits.filter(row => getNumber(row?.exitR) < 0).length;
  const completed = wins + losses;

  const totalR = exits.reduce((sum, row) => sum + getNumber(row?.exitR), 0);
  const totalPnlPct = exits.reduce((sum, row) => sum + getNumber(row?.pnlPct), 0);

  return {
    totalActions: rows.length,
    latestBatchCount: asArray(latest?.actions).length,

    entries: entries.length,
    exits: exits.length,
    waits: waits.length,
    holds: holds.length,

    wins,
    losses,
    completed,
    winratePct: completed > 0 ? Number(((wins / completed) * 100).toFixed(1)) : 0,

    totalR: Number(totalR.toFixed(3)),
    avgR: exits.length > 0 ? Number((totalR / exits.length).toFixed(3)) : 0,

    totalPnlPct: Number(totalPnlPct.toFixed(3)),
    avgPnlPct: exits.length > 0 ? Number((totalPnlPct / exits.length).toFixed(3)) : 0,

    actionCounts: countBy(rows, row => getActionType(row)),
    reasonCounts: countBy(rows, row =>
      String(row?.reason || "NO_REASON").toUpperCase()
    ),
    setupClassCounts: countBy(entries, row =>
      String(row?.setupClass || "UNKNOWN").toUpperCase()
    ),
    sideCounts: countBy(rows, row =>
      String(row?.side || "UNKNOWN").toUpperCase()
    ),
    btcStateCounts: countBy(rows, row =>
      String(row?.btcState || "UNKNOWN").toUpperCase()
    ),

    lastReceivedAt: latest?.receivedAt || null,
    strategyVersion:
      latest?.meta?.strategyVersion ||
      rows[rows.length - 1]?.strategyVersion ||
      null,
    runId:
      latest?.meta?.runId ||
      rows[rows.length - 1]?.runId ||
      null,
    btcState:
      latest?.meta?.btcState ||
      rows[rows.length - 1]?.btcState ||
      null
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const limit = Math.max(
    1,
    Math.min(
      Number(req.nextUrl.searchParams.get("limit") || MAX_STORED_ACTIONS),
      MAX_STORED_ACTIONS
    )
  );

  const [latest, storedActions] = await Promise.all([
    redisGetFirstJson<any | null>(LATEST_KEYS, null),
    redisGetFirstJson<TradeAction[]>(ACTION_KEYS, [])
  ]);

  const latestActions = asArray(latest?.actions);
  const storedRows = asArray(storedActions);

  const actions =
    storedRows.length > 0
      ? storedRows.slice(-limit)
      : latestActions.slice(-limit);

  const stats = buildFrontendStats(actions, latest);

  return NextResponse.json(
    {
      ok: true,
      route: "app-api-webhooks-tradesystem-online",
      redis: true,

      count: actions.length,
      latest,
      actions,
      stats,

      ts: Date.now()
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    }
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const meta: WebhookMeta = {
    runId: body?.runId || body?.meta?.runId || null,
    btcState: body?.btcState || body?.meta?.btcState || null,
    strategyVersion: body?.strategyVersion || body?.meta?.strategyVersion || null,
    discoveryMode: body?.discoveryMode ?? body?.meta?.discoveryMode ?? null
  };

  const normalizedActions = actions.map((action: TradeAction) =>
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

  const previousActions = await redisGetJson<TradeAction[]>(ACTION_KEYS[0], []);

  const mergedActions = [
    ...previousActions,
    ...normalizedActions
  ].slice(-MAX_STORED_ACTIONS);

  await Promise.all([
    ...LATEST_KEYS.map((key: string) => redisSetJson(key, latestPayload)),
    ...ACTION_KEYS.map((key: string) => redisSetJson(key, mergedActions))
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