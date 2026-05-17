import { getSql, hasDatabase } from "./db";
import type {
  NormalizedWebhookEvent,
  NormalizedEntry,
  NormalizedExit,
  NormalizedReject
} from "./normalize";

export type TradeEvent = {
  id: string;
  eventId: string;
  eventType: "ENTRY" | "EXIT" | "REJECT" | "SNAPSHOT";
  createdAt: string;

  source: string;
  strategyVersion: string | null;
  runId: string | null;
  tradeId: string | null;

  symbol: string | null;
  side: string | null;
  cohortKey: string | null;

  setupClass: string | null;
  reason: string | null;
  entryReason: string | null;
  exitReason: string | null;
  rejectReason: string | null;
  action: string | null;

  grade: string | null;
  gradePoints: number | null;

  entryPrice: number | null;
  exitPrice: number | null;
  triggerPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;

  rr: number | null;
  baseRR: number | null;
  finalRR: number | null;
  finalRr: number | null;
  plannedRR: number | null;
  requiredRR: number | null;
  finalRequiredRR: number | null;
  tpRewardMultiplier: number | null;

  scannerScore: number | null;
  score: number | null;
  confluence: number | null;
  rawConfluence: number | null;
  sniperScore: number | null;
  rawSniperScore: number | null;
  fallbackSniperScore: number | null;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;
  rsiEdge: string | null;
  continuationOk: boolean | null;

  btcState: string | null;
  regime: string | null;
  flow: string | null;
  tfStrength: number | null;
  tfAlignment: string | null;

  obBias: string | null;
  obRelation: string | null;
  spreadPct: number | null;
  spreadBps: number | null;
  spreadBucket: string | null;
  depthUsd1p: number | null;
  depthBucket: string | null;
  spoof: boolean | null;

  funding: number | null;
  fundingBucket: string | null;

  pullbackConfirmed: boolean | null;
  sweepConfirmed: boolean | null;
  retestConfirmed: boolean | null;
  distanceFromLocalHighPct: number | null;

  qualityGateReason: string | null;
  finalDepthReason: string | null;
  confirmationRequired: boolean | null;
  confirmationSeen: boolean | null;

  exitR: number | null;
  pnlPct: number | null;
  triggerR: number | null;
  triggerPnlPct: number | null;
  holdMinutes: number | null;

  mfeR: number | null;
  maeR: number | null;
  currentR: number | null;
  maxTpProgress: number | null;
  maxSlProgress: number | null;

  directToSL: boolean | null;
  reachedHalfR: boolean | null;
  reachedOneR: boolean | null;
  nearTpSeen: boolean | null;
  slAfterHalfR: boolean | null;
  slAfterOneR: boolean | null;
  slAfterNearTp: boolean | null;

  breakEvenActivated: boolean | null;
  breakEvenStop: boolean | null;

  wouldEntry: number | null;
  wouldTp: number | null;
  wouldSl: number | null;
  shadowEligible: boolean;

  payloadHash: string;
  payload: Record<string, any>;
};

type SaveResult = {
  ok: true;
  stored: boolean;
  deduped: boolean;
  mode: "POSTGRES" | "MEMORY_NO_DATABASE";
  eventId: string;
  eventType: string;
};

const memoryEvents = new Map<string, NormalizedWebhookEvent>();
let schemaReady = false;

function normalizeStoredEvent(value: unknown): NormalizedWebhookEvent | null {
  if (!value || typeof value !== "object") return null;
  return value as NormalizedWebhookEvent;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;

  const text = String(value).toLowerCase();

  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;

  return null;
}

function pickEntryReason(entry: NormalizedEntry | undefined): string | null {
  return entry?.entryReason ?? null;
}

function pickReason(
  entry: NormalizedEntry | undefined,
  exit: NormalizedExit | undefined,
  reject: NormalizedReject | undefined
): string | null {
  return (
    entry?.entryReason ??
    exit?.exitReason ??
    reject?.rejectReason ??
    reject?.action ??
    null
  );
}

function eventToTradeEvent(
  event: NormalizedWebhookEvent,
  createdAtOverride?: string
): TradeEvent {
  const entry = event.entry;
  const exit = event.exit;
  const reject = event.reject;

  const finalRR =
    entry?.finalRR ??
    reject?.finalRR ??
    null;

  const baseRR =
    entry?.baseRR ??
    reject?.baseRR ??
    null;

  const scannerScore =
    entry?.scannerScore ??
    reject?.scannerScore ??
    null;

  const entryPrice =
    entry?.entryPrice ??
    exit?.entryPrice ??
    reject?.wouldEntry ??
    null;

  const tpPrice =
    entry?.tpPrice ??
    exit?.tpPrice ??
    reject?.wouldTp ??
    null;

  const slPrice =
    entry?.slPrice ??
    exit?.slPrice ??
    reject?.wouldSl ??
    null;

  return {
    id: event.eventId,
    eventId: event.eventId,
    eventType: event.eventType,
    createdAt: createdAtOverride || new Date().toISOString(),

    source: event.source,
    strategyVersion: event.strategyVersion,
    runId: event.runId,
    tradeId: event.tradeId,

    symbol: event.symbol,
    side: event.side,
    cohortKey: event.cohortKey,

    setupClass: entry?.setupClass ?? null,
    reason: pickReason(entry, exit, reject),
    entryReason: pickEntryReason(entry),
    exitReason: exit?.exitReason ?? null,
    rejectReason: reject?.rejectReason ?? null,
    action: reject?.action ?? null,

    grade: entry?.grade ?? null,
    gradePoints: entry?.gradePoints ?? null,

    entryPrice,
    exitPrice: exit?.exitPrice ?? null,
    triggerPrice: exit?.triggerPrice ?? null,
    tpPrice,
    slPrice,

    rr: finalRR,
    baseRR,
    finalRR,
    finalRr: finalRR,
    plannedRR: finalRR,
    requiredRR: entry?.requiredRR ?? null,
    finalRequiredRR: entry?.finalRequiredRR ?? null,
    tpRewardMultiplier: entry?.tpRewardMultiplier ?? null,

    scannerScore,
    score: scannerScore,
    confluence: entry?.confluence ?? reject?.confluence ?? null,
    rawConfluence: entry?.rawConfluence ?? null,
    sniperScore: entry?.sniperScore ?? reject?.sniperScore ?? null,
    rawSniperScore: entry?.rawSniperScore ?? null,
    fallbackSniperScore: entry?.fallbackSniperScore ?? null,

    rsi: entry?.rsi ?? reject?.rsi ?? null,
    rsiHTF: entry?.rsiHTF ?? null,
    rsiZone: entry?.rsiZone ?? reject?.rsiZone ?? null,
    rsiEdge: entry?.rsiEdge ?? reject?.rsiEdge ?? null,
    continuationOk: entry?.continuationOk ?? null,

    btcState: entry?.btcState ?? reject?.btcState ?? null,
    regime: entry?.regime ?? reject?.regime ?? null,
    flow: entry?.flow ?? reject?.flow ?? null,
    tfStrength: entry?.tfStrength ?? null,
    tfAlignment: entry?.tfAlignment ?? null,

    obBias: entry?.obBias ?? reject?.obBias ?? null,
    obRelation: entry?.obRelation ?? reject?.obRelation ?? null,
    spreadPct: entry?.spreadPct ?? null,
    spreadBps: entry?.spreadBps ?? reject?.spreadBps ?? null,
    spreadBucket: entry?.spreadBucket ?? null,
    depthUsd1p: entry?.depthUsd1p ?? reject?.depthUsd1p ?? null,
    depthBucket: entry?.depthBucket ?? reject?.depthBucket ?? null,
    spoof: entry?.spoof ?? null,

    funding: entry?.funding ?? null,
    fundingBucket: entry?.fundingBucket ?? null,

    pullbackConfirmed: entry?.pullbackConfirmed ?? null,
    sweepConfirmed: entry?.sweepConfirmed ?? null,
    retestConfirmed: entry?.retestConfirmed ?? null,
    distanceFromLocalHighPct: entry?.distanceFromLocalHighPct ?? null,

    qualityGateReason: entry?.qualityGateReason ?? null,
    finalDepthReason: entry?.finalDepthReason ?? null,
    confirmationRequired: entry?.confirmationRequired ?? null,
    confirmationSeen: entry?.confirmationSeen ?? null,

    exitR: exit?.exitR ?? null,
    pnlPct: exit?.pnlPct ?? null,
    triggerR: exit?.triggerR ?? null,
    triggerPnlPct: exit?.triggerPnlPct ?? null,
    holdMinutes: exit?.holdMinutes ?? null,

    mfeR: exit?.mfeR ?? null,
    maeR: exit?.maeR ?? null,
    currentR: exit?.currentR ?? null,
    maxTpProgress: exit?.maxTpProgress ?? null,
    maxSlProgress: exit?.maxSlProgress ?? null,

    directToSL: exit?.directToSL ?? null,
    reachedHalfR: exit?.reachedHalfR ?? null,
    reachedOneR: exit?.reachedOneR ?? null,
    nearTpSeen: exit?.nearTpSeen ?? null,
    slAfterHalfR: exit?.slAfterHalfR ?? null,
    slAfterOneR: exit?.slAfterOneR ?? null,
    slAfterNearTp: exit?.slAfterNearTp ?? null,

    breakEvenActivated: exit?.breakEvenActivated ?? null,
    breakEvenStop: exit?.breakEvenStop ?? null,

    wouldEntry: reject?.wouldEntry ?? null,
    wouldTp: reject?.wouldTp ?? null,
    wouldSl: reject?.wouldSl ?? null,
    shadowEligible: reject?.shadowEligible ?? false,

    payloadHash: event.payloadHash,
    payload: event.payload
  };
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  const sql = getSql();

  if (!sql) {
    return;
  }

  await sql`
    create table if not exists trade_events (
      event_id text primary key,
      created_at timestamptz not null default now(),

      event_type text not null,
      source text not null,

      strategy_version text,
      run_id text,
      trade_id text,
      symbol text,
      side text,
      cohort_key text,

      payload_hash text not null,
      normalized jsonb not null
    )
  `;

  await sql`
    create index if not exists trade_events_created_at_idx
    on trade_events (created_at desc)
  `;

  await sql`
    create index if not exists trade_events_symbol_idx
    on trade_events (symbol)
  `;

  await sql`
    create index if not exists trade_events_event_type_idx
    on trade_events (event_type)
  `;

  await sql`
    create index if not exists trade_events_cohort_key_idx
    on trade_events (cohort_key)
  `;

  schemaReady = true;
}

export async function saveTradeEvent(
  event: NormalizedWebhookEvent
): Promise<SaveResult> {
  const sql = getSql();

  if (!sql) {
    const deduped = memoryEvents.has(event.eventId);
    memoryEvents.set(event.eventId, event);

    return {
      ok: true,
      stored: false,
      deduped,
      mode: "MEMORY_NO_DATABASE",
      eventId: event.eventId,
      eventType: event.eventType
    };
  }

  await ensureSchema();

  const inserted = await sql`
    insert into trade_events (
      event_id,
      event_type,
      source,
      strategy_version,
      run_id,
      trade_id,
      symbol,
      side,
      cohort_key,
      payload_hash,
      normalized
    )
    values (
      ${event.eventId},
      ${event.eventType},
      ${event.source},
      ${event.strategyVersion},
      ${event.runId},
      ${event.tradeId},
      ${event.symbol},
      ${event.side},
      ${event.cohortKey},
      ${event.payloadHash},
      ${sql.json(event)}
    )
    on conflict (event_id) do nothing
    returning event_id
  `;

  return {
    ok: true,
    stored: true,
    deduped: inserted.length === 0,
    mode: "POSTGRES",
    eventId: event.eventId,
    eventType: event.eventType
  };
}

export const saveWebhookEvent = saveTradeEvent;
export const storeWebhookEvent = saveTradeEvent;
export const persistWebhookEvent = saveTradeEvent;

export async function getTradeEvents(limit = 1000): Promise<TradeEvent[]> {
  const safeLimit = Math.max(1, Math.min(Number(limit || 1000), 10000));
  const sql = getSql();

  if (!sql) {
    return Array.from(memoryEvents.values())
      .slice(-safeLimit)
      .reverse()
      .map(event => eventToTradeEvent(event));
  }

  await ensureSchema();

  const rows = await sql`
    select
      created_at,
      normalized
    from trade_events
    order by created_at desc
    limit ${safeLimit}
  `;

  return rows
    .map(row => {
      const event = normalizeStoredEvent(row.normalized);
      if (!event) return null;

      return eventToTradeEvent(
        event,
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString()
      );
    })
    .filter((row): row is TradeEvent => Boolean(row));
}

export async function getRecentTradeEvents(limit = 1000): Promise<TradeEvent[]> {
  return getTradeEvents(limit);
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  mode: "POSTGRES" | "MEMORY_NO_DATABASE";
  deleted: number | null;
}> {
  const sql = getSql();

  if (!sql) {
    const deleted = memoryEvents.size;
    memoryEvents.clear();

    return {
      ok: true,
      mode: "MEMORY_NO_DATABASE",
      deleted
    };
  }

  await ensureSchema();

  const result = await sql`
    delete from trade_events
  `;

  return {
    ok: true,
    mode: "POSTGRES",
    deleted: Number(result.count || 0)
  };
}

export async function getStoreStatus(): Promise<{
  ok: boolean;
  databaseEnabled: boolean;
  mode: "POSTGRES" | "MEMORY_NO_DATABASE";
  count: number;
}> {
  const sql = getSql();

  if (!sql) {
    return {
      ok: true,
      databaseEnabled: false,
      mode: "MEMORY_NO_DATABASE",
      count: memoryEvents.size
    };
  }

  await ensureSchema();

  const rows = await sql`
    select count(*)::int as count
    from trade_events
  `;

  return {
    ok: true,
    databaseEnabled: hasDatabase(),
    mode: "POSTGRES",
    count: numberOrNull(rows?.[0]?.count) ?? 0
  };
}

export function normalizeBooleanForStore(value: unknown): boolean | null {
  return boolOrNull(value);
}