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

function parseJsonField(value: unknown): WebhookRecord {
  if (!value || typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as WebhookRecord;
  } catch {
    return {};
  }
}

function getEnvWebhookSecret(): string {
  return (
    process.env.ANALYSIS_WEBHOOK_SECRET ||
    process.env.WEBHOOK_SECRET ||
    process.env.TRADE_WEBHOOK_SECRET ||
    ""
  );
}

function shouldRequireWebhookSignature(): boolean {
  const explicit =
    process.env.REQUIRE_WEBHOOK_SIGNATURE ??
    process.env.REQUIRE_ANALYSIS_WEBHOOK_SECRET;

  if (explicit !== undefined) {
    return String(explicit).toLowerCase() === "true";
  }

  return Boolean(getEnvWebhookSecret());
}

function getAuthorizationBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || "";
}

function getIncomingTimestamp(req: NextRequest, body: WebhookRecord): string {
  return safeTrim(
    req.headers.get("x-webhook-timestamp") ||
      req.headers.get("x-analysis-webhook-timestamp") ||
      req.headers.get("x-trade-webhook-timestamp") ||
      body.timestamp ||
      body.ts ||
      ""
  );
}

function getIncomingSignature(req: NextRequest, body: WebhookRecord): string {
  const payloadJson = parseJsonField(body.payloadJson);
  const rawJson = parseJsonField(body.rawJson);

  const merged: WebhookRecord = {
    ...payloadJson,
    ...rawJson,
    ...body
  };

  const fromHeader =
    req.headers.get("x-webhook-signature") ||
    req.headers.get("x-analysis-webhook-signature") ||
    req.headers.get("x-trade-webhook-signature") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-analysis-webhook-secret") ||
    req.headers.get("x-trade-webhook-secret") ||
    getAuthorizationBearer(req);

  const fromBody =
    safeTrim(merged.signature) ||
    safeTrim(merged.webhookSignature) ||
    safeTrim(merged.webhookSecret) ||
    safeTrim(merged.xWebhookSignature) ||
    safeTrim(merged.xAnalysisWebhookSignature) ||
    safeTrim(merged.xTradeWebhookSignature);

  return safeTrim(fromHeader || fromBody);
}

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    const rawPayload = parseJsonObject(rawText);

    const secret = getEnvWebhookSecret();
    const signature = getIncomingSignature(req, rawPayload);
    const timestamp = getIncomingTimestamp(req, rawPayload);
    const requireSignature = shouldRequireWebhookSignature();

    if (requireSignature && !signature) {
      return NextResponse.json(
        {
          ok: false,
          error: "WEBHOOK_SIGNATURE_MISSING_ROUTE",
          hint: "Send x-webhook-signature / x-webhook-secret / Authorization Bearer."
        },
        { status: 400 }
      );
    }

    const result = await ingestTradeSystemEvent(rawText, {
      signature,
      timestamp,
      secret,
      requireSignature
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
    usage: "Send TradeSystem ENTRY / EXIT / REJECT / WAIT / SNAPSHOT payloads to this endpoint.",
    env: {
      hasAnalysisWebhookSecret: Boolean(process.env.ANALYSIS_WEBHOOK_SECRET),
      hasWebhookSecret: Boolean(process.env.WEBHOOK_SECRET),
      hasTradeWebhookSecret: Boolean(process.env.TRADE_WEBHOOK_SECRET),
      requireSignature: shouldRequireWebhookSignature()
    }
  });
}