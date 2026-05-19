import { NextRequest, NextResponse } from "next/server";

import {
  normalizeWebhookBody,
  type WebhookRecord,
  type NormalizedWebhookEvent
} from "@/lib/normalize";

import { saveTradeEvent } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRecord = Record<string, unknown>;

const WEBHOOK_SECRET =
  process.env.ANALYSIS_WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET ||
  process.env.TRADE_WEBHOOK_SECRET ||
  "";

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeUpper(value: unknown, fallback = ""): string {
  return safeString(value, fallback).toUpperCase();
}

function parseJson(text: string): unknown {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function parseNestedJsonObject(value: unknown): AnyRecord | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readAuthSecret(req: NextRequest): string {
  const bearer = req.headers.get("authorization") || "";

  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return (
    req.headers.get("x-analysis-webhook-secret") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-trade-webhook-secret") ||
    ""
  ).trim();
}

function isAuthorized(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return true;

  return readAuthSecret(req) === WEBHOOK_SECRET;
}

function getFirstArray(body: AnyRecord): unknown[] | null {
  const candidates = [
    body.rows,
    body.actions,
    body.data,
    body.events,
    body.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function getNestedBatchRows(body: AnyRecord): unknown[] | null {
  const payloadJson = parseNestedJsonObject(body.payloadJson);
  const rawJson = parseNestedJsonObject(body.rawJson);
  const payload = parseNestedJsonObject(body.payload);

  const nestedObjects = [payloadJson, rawJson, payload].filter(Boolean) as AnyRecord[];

  for (const nested of nestedObjects) {
    const rows = getFirstArray(nested);

    if (rows?.length) return rows;
  }

  return null;
}

function isBatchPayload(body: AnyRecord): boolean {
  const eventType = safeUpper(body.eventType || body.type || body.action);

  if (eventType === "BATCH") return true;

  return Boolean(
    Array.isArray(body.rows) ||
      Array.isArray(body.actions) ||
      Array.isArray(body.data) ||
      Array.isArray(body.events) ||
      Array.isArray(body.items)
  );
}

function getRowsFromRequestBody(parsed: unknown): AnyRecord[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }

  if (!isRecord(parsed)) {
    return [];
  }

  if (!isBatchPayload(parsed)) {
    return [parsed];
  }

  const rows = getFirstArray(parsed) || getNestedBatchRows(parsed) || [];

  return rows.filter(isRecord);
}

function enrichRowWithBatchMeta(row: AnyRecord, batch: unknown): WebhookRecord {
  if (!isRecord(batch)) {
    return row as WebhookRecord;
  }

  const rowEventType = safeUpper(row.eventType || row.type || row.action);
  const rowAction = safeUpper(row.action || row.eventType || row.type);

  return {
    source: row.source || batch.source || "tradesystem",
    runId: row.runId || batch.runId || null,
    strategyVersion: row.strategyVersion || batch.strategyVersion || "UNKNOWN",

    btcState: row.btcState || batch.btcState || "UNKNOWN",
    regime: row.regime || batch.regime || "UNKNOWN",
    discoveryMode: row.discoveryMode ?? batch.discoveryMode ?? false,

    ...row,

    eventType: rowEventType || rowAction || "SNAPSHOT",
    action: rowAction || rowEventType || "SNAPSHOT"
  };
}

function isWrapperEvent(event: NormalizedWebhookEvent): boolean {
  const type = safeUpper(event.eventType || event.action);

  return type === "BATCH";
}

function countByEventType(events: NormalizedWebhookEvent[]) {
  return events.reduce(
    (acc, event) => {
      const type = safeUpper(event.eventType, "UNKNOWN");

      if (type === "ENTRY") acc.entries += 1;
      else if (type === "EXIT") acc.exits += 1;
      else if (type === "REJECT") acc.rejects += 1;
      else if (type === "SNAPSHOT") acc.snapshots += 1;
      else if (type === "HOLD") acc.holds += 1;
      else acc.unknown += 1;

      return acc;
    },
    {
      entries: 0,
      exits: 0,
      rejects: 0,
      snapshots: 0,
      holds: 0,
      unknown: 0
    }
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      { status: 401 }
    );
  }

  const rawText = await req.text();
  const parsed = parseJson(rawText);

  const incomingRows = getRowsFromRequestBody(parsed);

  if (!incomingRows.length) {
    console.warn(
      "TRADESYSTEM_WEBHOOK_NO_ROWS:",
      JSON.stringify({
        parsedIsArray: Array.isArray(parsed),
        parsedIsRecord: isRecord(parsed),
        durationMs: Date.now() - startedAt
      })
    );

    return NextResponse.json(
      {
        ok: false,
        received: 0,
        normalized: 0,
        stored: 0,
        deduped: 0,
        failed: 0,
        persistent: false,
        error: "NO_ROWS_FOUND"
      },
      { status: 400 }
    );
  }

  const normalizedEvents: NormalizedWebhookEvent[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < incomingRows.length; i += 1) {
    const row = incomingRows[i];

    try {
      const enriched = enrichRowWithBatchMeta(row, parsed);
      const normalized = normalizeWebhookBody(enriched);

      // Cruciaal: nooit BATCH-wrapper events opslaan.
      if (isWrapperEvent(normalized)) {
        errors.push({
          index: i,
          error: "BATCH_ROW_SKIPPED"
        });

        continue;
      }

      normalizedEvents.push(normalized);
    } catch (error) {
      errors.push({
        index: i,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  let stored = 0;
  let deduped = 0;
  let failed = errors.length;
  let persistent = false;

  for (let i = 0; i < normalizedEvents.length; i += 1) {
    const event = normalizedEvents[i];

    try {
      const result = await saveTradeEvent(event);

      if (result.stored) stored += 1;
      if (result.deduped) deduped += 1;
      if (result.persistent) persistent = true;

      if (!result.ok) {
        failed += 1;

        errors.push({
          index: i,
          error: "SAVE_TRADE_EVENT_NOT_OK"
        });
      }
    } catch (error) {
      failed += 1;

      errors.push({
        index: i,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const counts = countByEventType(normalizedEvents);
  const ok = normalizedEvents.length > 0 && failed < incomingRows.length;
  const status = ok ? 200 : 500;

  console.log(
    "TRADESYSTEM_WEBHOOK_BATCH_RESULT:",
    JSON.stringify({
      ok,
      received: incomingRows.length,
      normalized: normalizedEvents.length,
      stored,
      deduped,
      failed,
      persistent,
      counts,
      durationMs: Date.now() - startedAt
    })
  );

  return NextResponse.json(
    {
      ok,
      received: incomingRows.length,
      normalized: normalizedEvents.length,
      stored,
      deduped,
      failed,
      persistent,
      counts,
      errors: errors.slice(0, 20),
      durationMs: Date.now() - startedAt
    },
    { status }
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/webhooks/tradesystem",
    accepts: ["single event", "BATCH.rows", "BATCH.actions", "BATCH.data"],
    stores: "individual normalized events only",
    ts: Date.now()
  });
}