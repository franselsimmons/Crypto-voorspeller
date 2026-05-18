import { NextRequest, NextResponse } from "next/server";
import { ingestTradeSystemEvent } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookRecord = Record<string, unknown>;
type FlatWebhookRecord = Record<string, string>;

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

function parseJsonObject(text: string): WebhookRecord {
  try {
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as WebhookRecord;
  } catch {
    return {};
  }
}

function safeJsonParseObject(value: unknown): WebhookRecord | null {
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

function getEnvWebhookSecret(): string {
  return safeTrim(
    process.env.ANALYSIS_WEBHOOK_SECRET ||
      process.env.WEBHOOK_SECRET ||
      process.env.TRADE_WEBHOOK_SECRET ||
      ""
  );
}

function getAuthorizationBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || "";
}

function getIncomingSignature(req: NextRequest, body: WebhookRecord): string {
  const fromHeader =
    req.headers.get("x-webhook-signature") ||
    req.headers.get("x-analysis-webhook-signature") ||
    req.headers.get("x-trade-webhook-signature") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-analysis-webhook-secret") ||
    req.headers.get("x-trade-webhook-secret") ||
    getAuthorizationBearer(req);

  const fromBody =
    safeTrim(body.signature) ||
    safeTrim(body.webhookSignature) ||
    safeTrim(body.webhookSecret) ||
    safeTrim(body.xWebhookSignature) ||
    safeTrim(body.xAnalysisWebhookSignature) ||
    safeTrim(body.xTradeWebhookSignature);

  // Belangrijk: NIET fallbacken naar eigen env-secret.
  return safeTrim(fromHeader || fromBody || "");
}

function normalizeTradeSystemWebhookBody(
  rawBody: WebhookRecord,
  signature: string
): FlatWebhookRecord {
  const payloadFromJson = safeJsonParseObject(rawBody.payloadJson);

  const merged: WebhookRecord = {
    ...(payloadFromJson || {}),
    ...rawBody
  };

  const normalized: FlatWebhookRecord = {};

  for (const [key, value] of Object.entries(merged)) {
    normalized[key] = safeString(value);
  }

  const now = String(Date.now());

  const fallbackEventId = `ts_${now}_${Math.random()
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

  normalized.ts = safeTrim(normalized.ts || now, now);

  // Compat: dashboards/normalizer mogen deze velden gebruiken.
  normalized.signature = signature;
  normalized.webhookSignature = signature;
  normalized.webhookSecret = signature;

  normalized.payloadJson = safeString(
    normalized.payloadJson || JSON.stringify(merged)
  );

  normalized.rawJson = safeString(JSON.stringify(merged));

  for (const [key, value] of Object.entries(normalized)) {
    normalized[key] = safeString(value);
  }

  return normalized;
}

function verifySharedSecret(req: NextRequest, rawPayload: WebhookRecord): {
  ok: boolean;
  signature: string;
  error?: string;
} {
  const expectedSecret = getEnvWebhookSecret();
  const incomingSignature = getIncomingSignature(req, rawPayload);

  if (!expectedSecret) {
    return {
      ok: false,
      signature: "",
      error: "WEBHOOK_SECRET_ENV_MISSING"
    };
  }

  if (!incomingSignature) {
    return {
      ok: false,
      signature: "",
      error: "WEBHOOK_SIGNATURE_MISSING_ROUTE"
    };
  }

  if (incomingSignature !== expectedSecret) {
    return {
      ok: false,
      signature: incomingSignature,
      error: "WEBHOOK_SIGNATURE_INVALID_ROUTE"
    };
  }

  return {
    ok: true,
    signature: incomingSignature
  };
}

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    const rawPayload = parseJsonObject(rawText);

    const signatureCheck = verifySharedSecret(req, rawPayload);

    if (!signatureCheck.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: signatureCheck.error,
          hint: "TradeSystem moet dezelfde ANALYSIS_WEBHOOK_SECRET sturen als deze analyse-app verwacht."
        },
        { status: 400 }
      );
    }

    const payload = normalizeTradeSystemWebhookBody(
      rawPayload,
      signatureCheck.signature
    );

    const normalizedRawBody = JSON.stringify(payload);

    /**
     * Belangrijk:
     * Deze route doet zelf shared-secret validatie.
     * ingest.ts verwacht HMAC-signatures via options.signature.
     * Jouw notifier stuurt shared-secret, geen HMAC.
     * Daarom hier requireSignature:false.
     */
    const result = await ingestTradeSystemEvent(normalizedRawBody, {
      requireSignature: false
    });

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
    usage: "Send TradeSystem ENTRY / EXIT / REJECT / SNAPSHOT payloads to this endpoint.",
    env: {
      hasAnalysisWebhookSecret: Boolean(process.env.ANALYSIS_WEBHOOK_SECRET),
      hasWebhookSecret: Boolean(process.env.WEBHOOK_SECRET),
      hasTradeWebhookSecret: Boolean(process.env.TRADE_WEBHOOK_SECRET)
    }
  });
}