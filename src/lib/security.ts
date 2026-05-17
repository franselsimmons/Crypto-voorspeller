import crypto from "node:crypto";

function safeEqualHex(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");

  if (aBuffer.length !== bBuffer.length) return false;

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function sign(rawBody: string, timestamp: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function verifyWebhookSignature(params: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const requireSignature = process.env.REQUIRE_WEBHOOK_SIGNATURE !== "false";

  if (!requireSignature) return { ok: true };

  const current = process.env.TRADE_WEBHOOK_SECRET_CURRENT || "";
  const previous = process.env.TRADE_WEBHOOK_SECRET_PREVIOUS || "";

  if (!current && !previous) {
    return { ok: false, reason: "WEBHOOK_SECRET_MISSING" };
  }

  const timestamp = params.timestampHeader;
  const signatureRaw = params.signatureHeader;

  if (!timestamp || !signatureRaw) {
    return { ok: false, reason: "SIGNATURE_HEADERS_MISSING" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "INVALID_TIMESTAMP" };
  }

  const ageMs = Math.abs(Date.now() - ts);
  if (ageMs > 5 * 60 * 1000) {
    return { ok: false, reason: "TIMESTAMP_OUTSIDE_WINDOW" };
  }

  const provided = signatureRaw.replace("sha256=", "").trim();

  const secrets = [current, previous].filter(Boolean);

  for (const secret of secrets) {
    const expected = sign(params.rawBody, timestamp, secret);
    if (safeEqualHex(provided, expected)) return { ok: true };
  }

  return { ok: false, reason: "INVALID_SIGNATURE" };
}