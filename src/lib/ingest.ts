import { normalizeWebhookBody, type NormalizedWebhookEvent } from "./normalize";
import { saveTradeEvent } from "./store";
import { verifyWebhookSignature } from "./security";

type IngestResult = {
  ok: boolean;
  accepted: boolean;
  deduped: boolean;
  eventId: string;
  eventType: string;
  symbol: string | null;
  side: string | null;
  tradeId: string | null;
  cohortKey: string | null;
  saved?: unknown;
};

type IngestOptions = {
  signature?: string | null;
  timestamp?: string | null;
  secret?: string | null;
  requireSignature?: boolean;
};

function shouldRequireSignature(options?: IngestOptions): boolean {
  if (typeof options?.requireSignature === "boolean") {
    return options.requireSignature;
  }

  return Boolean(process.env.WEBHOOK_SECRET);
}

function assertValidBody(rawBody: string): void {
  if (!rawBody || !rawBody.trim()) {
    throw new Error("EMPTY_WEBHOOK_BODY");
  }
}

function assertSignature(rawBody: string, options?: IngestOptions): void {
  const requireSignature = shouldRequireSignature(options);

  if (!requireSignature) return;

  const secret = options?.secret || process.env.WEBHOOK_SECRET || "";
  const signature = options?.signature || "";

  if (!secret) {
    throw new Error("WEBHOOK_SECRET_MISSING");
  }

  if (!signature) {
    throw new Error("WEBHOOK_SIGNATURE_MISSING");
  }

  const valid = verifyWebhookSignature(rawBody, signature, secret);

  if (!valid) {
    throw new Error("WEBHOOK_SIGNATURE_INVALID");
  }
}

function buildResult(
  normalized: NormalizedWebhookEvent,
  saved: any
): IngestResult {
  return {
    ok: true,
    accepted: true,
    deduped: Boolean(saved?.deduped),
    eventId: normalized.eventId,
    eventType: normalized.eventType,
    symbol: normalized.symbol,
    side: normalized.side,
    tradeId: normalized.tradeId,
    cohortKey: normalized.cohortKey,
    saved
  };
}

export async function ingestTradeSystemWebhook(
  rawBody: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  assertValidBody(rawBody);
  assertSignature(rawBody, options);

  const normalized = normalizeWebhookBody(rawBody);
  const saved = await saveTradeEvent(normalized);

  return buildResult(normalized, saved);
}

export async function ingestWebhook(
  rawBody: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  return ingestTradeSystemWebhook(rawBody, options);
}

export async function ingestTradeEvent(
  rawBody: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  return ingestTradeSystemWebhook(rawBody, options);
}

export default ingestTradeSystemWebhook;