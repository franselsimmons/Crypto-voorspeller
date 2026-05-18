import { NextRequest, NextResponse } from "next/server";
import { ingestTradeSystemEvent } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookRecord = Record<string, unknown>;

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string") return value;

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

function safeTrim(value: unknown, fallback = ""): string {
  return safeString(value, fallback).trim();
}

function safeJsonParse(value: unknown): WebhookRecord | null {
  if (!value || typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as WebhookRecord;
  } catch {
    return null;
  }
}

function normalizeTradeSystemWebhookBody(rawBody: unknown): Record<string, string> {
  const body: WebhookRecord =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as WebhookRecord)
      : {};

  const payloadFromJson = safeJsonParse(body.payloadJson);

  const merged: WebhookRecord = {
    ...(payloadFromJson || {}),
    ...body
  };

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(merged)) {
    normalized[key] = safeString(value);
  }

  const fallbackEventId = `ts_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  normalized.eventId = safeTrim(
    normalized.eventId || fallbackEventId,
    fallbackEventId
  );

  normalized.eventType = safeTrim(
    normalized.eventType || normalized.action || "SNAPSHOT",
    "SNAPSHOT"
  ).toUpperCase();

  normalized.source = safeTrim(
    normalized.source || "TRADE_SYSTEM",
    "TRADE_SYSTEM"
  );

  normalized.strategyVersion = safeTrim(
    normalized.strategyVersion || "UNKNOWN",
    "UNKNOWN"
  );

  normalized.runId = safeTrim(
    normalized.runId || "UNKNOWN",
    "UNKNOWN"
  );

  normalized.tradeId = safeTrim(
    normalized.tradeId || normalized.eventId,
    normalized.eventId
  );

  normalized.symbol = safeTrim(
    normalized.symbol || "UNKNOWN",
    "UNKNOWN"
  ).toUpperCase();

  normalized.side = safeTrim(
    normalized.side || "unknown",
    "unknown"
  ).toLowerCase();

  normalized.action = safeTrim(
    normalized.action || normalized.eventType || "SNAPSHOT",
    "SNAPSHOT"
  ).toUpperCase();

  normalized.rejectReason = safeTrim(normalized.rejectReason || "");
  normalized.exitReason = safeTrim(normalized.exitReason || "");
  normalized.entryReason = safeTrim(normalized.entryReason || "");

  normalized.reason = safeTrim(
    normalized.reason ||
      normalized.rejectReason ||
      normalized.exitReason ||
      normalized.entryReason ||
      "UNKNOWN",
    "UNKNOWN"
  );

  normalized.ts = safeTrim(
    normalized.ts || Date.now(),
    String(Date.now())
  );

  // Compat velden voor dashboards / ingest die oude namen gebruiken.
  normalized.payloadJson = safeString(
    normalized.payloadJson || JSON.stringify(merged)
  );

  normalized.rawJson = safeString(JSON.stringify(merged));

  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    const rawPayload = await req.json();
    const payload = normalizeTradeSystemWebhookBody(rawPayload);

    // ingestTradeSystemEvent verwacht een string.
    // Daarom hier bewust JSON.stringify(payload).
    const result = await ingestTradeSystemEvent(JSON.stringify(payload));

    return NextResponse.json(result, {
      status: result?.deduped ? 200 : 202
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook error";

    console.error("TRADESYSTEM_WEBHOOK_ERROR:", {
      message,
      stack: error instanceof Error ? error.stack : null
    });

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "tradesystem-webhook",
    methods: ["POST"],
    usage: "Send TradeSystem ENTRY / EXIT / REJECT / SNAPSHOT payloads to this endpoint."
  });
}