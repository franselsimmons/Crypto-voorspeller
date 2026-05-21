import { NextRequest, NextResponse } from "next/server";

import {
  saveTradeEvents,
  listTradeEvents,
  getTradeEventCount,
  hasRedis,
  MAX_STORED_ACTIONS
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const WEBHOOK_SECRET =
  process.env.ANALYSIS_WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "090117";

type WebhookMeta = {
  runId: string | null;
  btcState: string | null;
  strategyVersion: string | null;
  discoveryMode: unknown;
};

type TradeAction = Record<string, any>;

function checkSecret(req: NextRequest): boolean {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");

  return urlSecret === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): TradeAction[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function extractActions(body: any): TradeAction[] {
  if (Array.isArray(body)) return body.filter(isRecord);

  if (Array.isArray(body?.actions)) return body.actions.filter(isRecord);
  if (Array.isArray(body?.events)) return body.events.filter(isRecord);
  if (Array.isArray(body?.data)) return body.data.filter(isRecord);
  if (Array.isArray(body?.trades)) return body.trades.filter(isRecord);

  if (Array.isArray(body?.payload?.actions)) {
    return body.payload.actions.filter(isRecord);
  }

  if (Array.isArray(body?.payload?.events)) {
    return body.payload.events.filter(isRecord);
  }

  if (Array.isArray(body?.payload?.data)) {
    return body.payload.data.filter(isRecord);
  }

  if (Array.isArray(body?.payload?.trades)) {
    return body.payload.trades.filter(isRecord);
  }

  if (isRecord(body?.payload) && looksLikeTradeEvent(body.payload)) {
    return [body.payload];
  }

  if (isRecord(body) && looksLikeTradeEvent(body)) {
    return [body];
  }

  return [];
}

function looksLikeTradeEvent(value: Record<string, any>): boolean {
  return Boolean(
    value.eventId ||
      value.eventType ||
      value.action ||
      value.tradeId ||
      value.signalId ||
      value.symbol ||
      value.rawBitgetSymbol ||
      value.contractSymbol ||
      value.filterSnapshot ||
      value.exitR !== undefined ||
      value.pnlPct !== undefined
  );
}

function normalizeEventType(rawEventType: unknown, rawAction: unknown): string {
  const eventType = String(rawEventType || "").trim().toUpperCase();
  const action = String(rawAction || "").trim().toUpperCase();
  const value = eventType || action || "SNAPSHOT";

  if (value.includes("ENTRY")) return "ENTRY";
  if (value.includes("ENTER")) return "ENTRY";
  if (value.includes("OPEN_TRADE")) return "ENTRY";
  if (value === "OPEN") return "ENTRY";

  if (value.includes("EXIT")) return "EXIT";
  if (value.includes("CLOSE")) return "EXIT";
  if (value.includes("CLOSED")) return "EXIT";

  if (value.includes("REJECT")) return "REJECT";
  if (value.includes("WAIT")) return "REJECT";
  if (value.includes("SKIP")) return "REJECT";
  if (value.includes("FILTER_FAIL")) return "REJECT";

  if (value.includes("SNAPSHOT")) return "SNAPSHOT";
  if (value.includes("HOLD")) return "HOLD";

  return value;
}

function normalizeSide(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase();

  if (!raw) return null;

  if (["BULL", "LONG", "BUY", "BULLISH"].includes(raw)) return "LONG";
  if (["BEAR", "SHORT", "SELL", "BEARISH"].includes(raw)) return "SHORT";

  return raw;
}

function normalizeBaseSymbol(value: unknown): string | null {
  const symbol = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/_UMCBL$/, "")
    .replace(/_DMCBL$/, "")
    .replace(/_CMCBL$/, "")
    .replace(/-UMCBL$/, "")
    .replace(/-DMCBL$/, "")
    .replace(/-CMCBL$/, "")
    .replace(/USDT$/, "")
    .replace(/USDC$/, "")
    .replace(/USD$/, "");

  return symbol || null;
}

function getMeta(body: any): WebhookMeta {
  return {
    runId: body?.runId || body?.meta?.runId || body?.payload?.runId || null,
    btcState:
      body?.btcState ||
      body?.meta?.btcState ||
      body?.payload?.btcState ||
      null,
    strategyVersion:
      body?.strategyVersion ||
      body?.meta?.strategyVersion ||
      body?.payload?.strategyVersion ||
      null,
    discoveryMode:
      body?.discoveryMode ??
      body?.meta?.discoveryMode ??
      body?.payload?.discoveryMode ??
      null
  };
}

function normalizeAction(action: TradeAction, meta: WebhookMeta): TradeAction {
  const eventType = normalizeEventType(action.eventType, action.action);
  const now = Date.now();

  const symbol =
    normalizeBaseSymbol(
      action.symbol ||
        action.rawBitgetSymbol ||
        action.contractSymbol ||
        action?.payload?.symbol ||
        action?.payload?.rawBitgetSymbol ||
        action?.payload?.contractSymbol
    ) || null;

  const side = normalizeSide(action.side || action?.payload?.side);

  const tradeId =
    action.tradeId ||
    action.id ||
    action.signalId ||
    action?.payload?.tradeId ||
    action?.payload?.id ||
    action?.payload?.signalId ||
    null;

  const eventId =
    action.eventId ||
    action?.payload?.eventId ||
    [
      "ts",
      meta.runId || action.runId || "run_unknown",
      eventType,
      symbol || "UNKNOWN",
      side || "UNKNOWN",
      tradeId || now
    ]
      .join("_")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .slice(0, 260);

  return {
    ...action,

    eventId,
    eventType,
    action: eventType,

    tradeId,
    symbol,
    side,

    receivedAt: now,
    storedAt: now,

    runId: meta.runId || action.runId || action?.payload?.runId || null,
    strategyVersion:
      meta.strategyVersion ||
      action.strategyVersion ||
      action?.payload?.strategyVersion ||
      null,
    btcState:
      meta.btcState ||
      action.btcState ||
      action?.payload?.btcState ||
      null,
    discoveryMode:
      meta.discoveryMode ??
      action.discoveryMode ??
      action?.payload?.discoveryMode ??
      null
  };
}

function getActionType(row: TradeAction): string {
  return normalizeEventType(row?.eventType, row?.action);
}

function getNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const n = Number(String(value).replace("%", "").replace(",", ".").trim());
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

function buildFrontendStats(rows: TradeAction[]) {
  const entries = rows.filter(row => getActionType(row) === "ENTRY");
  const exits = rows.filter(row => getActionType(row) === "EXIT");
  const rejects = rows.filter(row => getActionType(row) === "REJECT");
  const snapshots = rows.filter(row => getActionType(row) === "SNAPSHOT");
  const holds = rows.filter(row => getActionType(row) === "HOLD");

  const wins = exits.filter(row => getNumber(row?.exitR) > 0).length;
  const losses = exits.filter(row => getNumber(row?.exitR) < 0).length;
  const completed = wins + losses;

  const totalR = exits.reduce((sum, row) => sum + getNumber(row?.exitR), 0);
  const totalPnlPct = exits.reduce((sum, row) => sum + getNumber(row?.pnlPct), 0);

  return {
    totalActions: rows.length,

    entries: entries.length,
    exits: exits.length,
    rejects: rejects.length,
    snapshots: snapshots.length,
    holds: holds.length,

    wins,
    losses,
    completed,

    winratePct:
      completed > 0 ? Number(((wins / completed) * 100).toFixed(1)) : 0,

    totalR: Number(totalR.toFixed(3)),
    avgR: exits.length > 0 ? Number((totalR / exits.length).toFixed(3)) : 0,

    totalPnlPct: Number(totalPnlPct.toFixed(3)),
    avgPnlPct:
      exits.length > 0 ? Number((totalPnlPct / exits.length).toFixed(3)) : 0,

    actionCounts: countBy(rows, row => getActionType(row)),

    reasonCounts: countBy(rows, row =>
      String(row?.reason || row?.exitReason || row?.entryReason || "NO_REASON").toUpperCase()
    ),

    setupClassCounts: countBy(rows, row =>
      String(row?.setupClass || row?.payload?.setupClass || "UNKNOWN").toUpperCase()
    ),

    sideCounts: countBy(rows, row =>
      String(row?.side || row?.payload?.side || "UNKNOWN").toUpperCase()
    ),

    symbolCounts: countBy(rows, row =>
      String(row?.symbol || row?.payload?.symbol || "UNKNOWN").toUpperCase()
    ),

    btcStateCounts: countBy(rows, row =>
      String(row?.btcState || row?.payload?.btcState || "UNKNOWN").toUpperCase()
    ),

    lastReceivedAt: rows[rows.length - 1]?.receivedAt || null,
    strategyVersion:
      rows[rows.length - 1]?.strategyVersion ||
      rows[rows.length - 1]?.payload?.strategyVersion ||
      null,
    runId:
      rows[rows.length - 1]?.runId ||
      rows[rows.length - 1]?.payload?.runId ||
      null,
    btcState:
      rows[rows.length - 1]?.btcState ||
      rows[rows.length - 1]?.payload?.btcState ||
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

  const limit = Math.max(
    1,
    Math.min(
      Number(req.nextUrl.searchParams.get("limit") || MAX_STORED_ACTIONS),
      MAX_STORED_ACTIONS
    )
  );

  const events = await listTradeEvents();
  const sliced = events.slice(-limit);
  const count = await getTradeEventCount();

  return NextResponse.json(
    {
      ok: true,
      route: "app-api-webhooks-tradesystem-online",
      storage: "store",
      redis: hasRedis(),

      count,
      returned: sliced.length,
      actions: sliced,
      stats: buildFrontendStats(sliced),

      maxStoredActions: MAX_STORED_ACTIONS,
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

  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const rawActions = extractActions(body);
  const meta = getMeta(body);

  if (!rawActions.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_actions_extracted",
        rawKeys: isRecord(body) ? Object.keys(body) : [],
        payloadKeys: isRecord(body?.payload) ? Object.keys(body.payload) : [],
        route: "app-api-webhooks-tradesystem-online",
        ts: Date.now()
      },
      { status: 400 }
    );
  }

  const normalizedActions = rawActions.map(action =>
    normalizeAction(action, meta)
  );

  const result = await saveTradeEvents(normalizedActions);
  const events = await listTradeEvents();
  const latest = events.slice(-Math.min(25, MAX_STORED_ACTIONS));

  return NextResponse.json(
    {
      ok: result.ok,
      route: "app-api-webhooks-tradesystem-online",
      storage: "store",

      received: normalizedActions.length,
      stored: result.stored,
      deduped: result.deduped,
      total: result.total,

      persistent: result.persistent,
      redis: result.redis,
      key: result.key,

      stats: buildFrontendStats(events),
      latest,

      rawKeys: isRecord(body) ? Object.keys(body) : [],
      ts: Date.now()
    },
    {
      status: result.ok ? 200 : 500,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    }
  );
}