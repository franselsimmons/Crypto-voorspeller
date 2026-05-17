import crypto from "crypto";
import { saveTradeEvent } from "@/lib/store";

type AnyRecord = Record<string, any>;

function isObject(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSide(side: unknown): "LONG" | "SHORT" {
  const s = String(side || "").toLowerCase();

  if (["short", "bear", "sell", "bearish"].includes(s)) return "SHORT";

  return "LONG";
}

function normalizeEventType(payload: AnyRecord): "ENTRY" | "EXIT" {
  const rawType = String(payload.type || payload.eventType || payload.kind || "").toUpperCase();
  const reason = String(payload.reason || payload.exitReason || "").toUpperCase();

  if (rawType.includes("EXIT")) return "EXIT";
  if (reason === "TP" || reason === "SL" || reason.includes("STOP") || reason.includes("TAKE")) return "EXIT";

  return "ENTRY";
}

function stableHash(payload: AnyRecord) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    return String(value);
  }

  return null;
}

function buildCohortKey(payload: AnyRecord) {
  const analytics = isObject(payload.analytics) ? payload.analytics : {};
  const market = isObject(payload.market) ? payload.market : {};
  const ob = isObject(payload.ob) ? payload.ob : {};
  const rsi = isObject(payload.rsi) ? payload.rsi : {};
  const rr = isObject(payload.rr) ? payload.rr : {};
  const structure = isObject(payload.structure) ? payload.structure : {};

  const parts = [
    `SETUP=${pickString(payload.setupClass, payload.class, analytics.setupClass) || "NA"}`,
    `SIDE=${String(payload.side || "NA").toLowerCase()}`,
    `REASON=${pickString(payload.entryReason, payload.reason, analytics.entryReason) || "NA"}`,
    `RSI=${pickString(payload.rsiZone, rsi.rsiZone, rsi.zone) || "NA"}`,
    `EDGE=${pickString(payload.rsiEdge, rsi.rsiEdge, rsi.edge) || "NA"}`,
    `FLOW=${pickString(payload.flow, market.flow) || "NA"}`,
    `BTC=${pickString(payload.btcState, market.btcState) || "NA"}`,
    `OB=${pickString(payload.obBias, ob.bias) || "NA"}`,
    `SPREAD=${pickString(payload.spreadBucket, ob.spreadBucket) || "NA"}`,
    `DEPTH=${pickString(payload.depthBucket, ob.depthBucket) || "NA"}`,
    `PULLBACK=${structure.pullbackConfirmed === true ? "YES" : "NO"}`,
    `SWEEP=${structure.sweepConfirmed === true ? "YES" : "NO"}`,
    `RETEST=${structure.retestConfirmed === true ? "YES" : "NO"}`,
    `RR=${pickNumber(payload.finalRr, rr.finalRr) ?? "NA"}`
  ];

  return parts.join("|");
}

export async function ingestTradeSystemEvent(payload: unknown) {
  if (!isObject(payload)) {
    throw new Error("Webhook payload must be an object");
  }

  const eventType = normalizeEventType(payload);
  const symbol = String(payload.symbol || payload.coin || "UNKNOWN").toUpperCase();
  const side = normalizeSide(payload.side);

  const eventId =
    pickString(payload.eventId, payload.id, payload.tradeId) ||
    `${symbol}-${side}-${eventType}-${stableHash(payload).slice(0, 24)}`;

  const cohortKey = pickString(payload.cohortKey) || buildCohortKey(payload);

  const normalized = {
    eventId,
    eventType,
    symbol,
    side,
    cohortKey,
    createdAt: new Date().toISOString(),

    entryPrice: pickNumber(payload.entry, payload.entryPrice, payload.price?.entry),
    exitPrice: pickNumber(payload.exit, payload.exitPrice, payload.price?.exit),
    tpPrice: pickNumber(payload.tp, payload.takeProfit, payload.price?.tp),
    slPrice: pickNumber(payload.sl, payload.stopLoss, payload.price?.sl),

    reason: pickString(payload.reason, payload.entryReason, payload.exitReason),
    grade: pickString(payload.grade, payload.liveGrade, payload.setup?.grade),
    setupClass: pickString(payload.setupClass, payload.class, payload.setup?.setupClass),

    pnlPct: pickNumber(payload.pnlPct, payload.pnl, payload.outcome?.pnlPct),
    exitR: pickNumber(payload.exitR, payload.rMultiple, payload.outcome?.exitR),
    mfer: pickNumber(payload.mfeR, payload.path?.mfeR),
    maer: pickNumber(payload.maeR, payload.path?.maeR),

    raw: payload
  };

  const saved = await saveTradeEvent(normalized);

  return {
    ok: true,
    deduped: saved.deduped,
    eventId,
    eventType,
    symbol,
    side,
    cohortKey
  };
}