import crypto from "crypto";
import { normalizeWebhookBody, type NormalizedWebhookEvent } from "./normalize";
import { saveTradeEvent } from "./store";

export type IngestResult = {
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

export type IngestOptions = {
  signature?: string | null;
  timestamp?: string | null;
  secret?: string | null;
  requireSignature?: boolean;
};

function getDefaultWebhookSecret(): string {
  return (
    process.env.WEBHOOK_SECRET ||
    process.env.ANALYSIS_WEBHOOK_SECRET ||
    process.env.TRADE_WEBHOOK_SECRET ||
    ""
  );
}

function shouldRequireSignature(options?: IngestOptions): boolean {
  if (typeof options?.requireSignature === "boolean") {
    return options.requireSignature;
  }

  const explicit =
    process.env.REQUIRE_WEBHOOK_SIGNATURE ??
    process.env.REQUIRE_ANALYSIS_WEBHOOK_SECRET;

  if (explicit !== undefined) {
    return String(explicit).toLowerCase() === "true";
  }

  return Boolean(getDefaultWebhookSecret());
}

function assertValidBody(rawBody: string): void {
  if (!rawBody || !rawBody.trim()) {
    throw new Error("EMPTY_WEBHOOK_BODY");
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");

    if (left.length !== right.length) return false;

    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function extractSignature(signatureHeader: string): string {
  const header = String(signatureHeader || "").trim();

  if (!header) return "";

  const v1 = header
    .split(",")
    .map(part => part.trim())
    .find(part => part.startsWith("v1="));

  if (v1) return v1.slice(3).trim();

  return header.replace(/^sha256=/i, "").trim();
}

function signPayload(rawBody: string, secret: string, timestamp?: string | null): string {
  const payloadToSign = timestamp ? `${timestamp}.${rawBody}` : rawBody;

  return crypto
    .createHmac("sha256", secret)
    .update(payloadToSign, "utf8")
    .digest("hex");
}

function verifyHmacWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
  timestamp
}: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  timestamp?: string | null;
}): boolean {
  const received = extractSignature(signatureHeader);

  if (!received) return false;

  const expectedWithTimestamp = signPayload(rawBody, secret, timestamp);
  const expectedRaw = signPayload(rawBody, secret);

  return (
    timingSafeEqualHex(received, expectedWithTimestamp) ||
    timingSafeEqualHex(received, expectedRaw)
  );
}

function verifySharedSecretSignature(signatureHeader: string, secret: string): boolean {
  const received = extractSignature(signatureHeader);

  if (!received || !secret) return false;

  return timingSafeEqualString(received, secret);
}

function assertSignature(rawBody: string, options?: IngestOptions): void {
  const requireSignature = shouldRequireSignature(options);

  if (!requireSignature) return;

  const secret = options?.secret || getDefaultWebhookSecret();
  const signature = options?.signature || "";
  const timestamp = options?.timestamp || null;

  if (!secret) {
    throw new Error("WEBHOOK_SECRET_MISSING");
  }

  if (!signature) {
    throw new Error("WEBHOOK_SIGNATURE_MISSING");
  }

  const validSharedSecret = verifySharedSecretSignature(signature, secret);

  if (validSharedSecret) return;

  const validHmac = verifyHmacWebhookSignature({
    rawBody,
    signatureHeader: signature,
    secret,
    timestamp
  });

  if (validHmac) return;

  throw new Error("WEBHOOK_SIGNATURE_INVALID");
}

function buildResult(
  normalized: NormalizedWebhookEvent,
  saved: unknown
): IngestResult {
  const deduped =
    typeof saved === "object" &&
    saved !== null &&
    "deduped" in saved &&
    Boolean((saved as { deduped?: boolean }).deduped);

  return {
    ok: true,
    accepted: true,
    deduped,
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

export async function ingestTradeSystemEvent(
  rawBody: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  return ingestTradeSystemWebhook(rawBody, options);
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