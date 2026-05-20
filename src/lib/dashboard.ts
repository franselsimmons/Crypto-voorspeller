import { listTradeEvents, type TradeEvent } from "./store";

export type SearchParams = Record<string, string | string[] | undefined>;

export type DashboardFilters = {
  strategyVersion: string;
  symbol: string;
  side: string;
  eventType: string;
  reason: string;
  setupClass: string;
  grade: string;
  regime: string;
  flow: string;
  btcState: string;
  rsiZone: string;
  rsiEdge: string;
  obBias: string;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;
  outcome: string;
  from: string;
  to: string;

  minTrades: string;
  minWilson: string;
  minWinrate: string;

  winrateWeight: string;
  wilsonWeight: string;
  pnlWeight: string;
  avgRWeight: string;
  profitFactorWeight: string;
  nearTpWeight: string;
  nearTpBonus: string;
  directSlPenalty: string;
};

export type Overview = {
  entries: number;
  events: number;
  entryEvents: number;
  exitEvents: number;
  rejects: number;
  snapshots: number;
  holds: number;

  closed: number;
  open: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;
};

export type DashboardOptions = {
  strategies: string[];
  strategyVersions: string[];
  symbols: string[];
  sides: string[];
  eventTypes: string[];
  reasons: string[];
  setupClasses: string[];
  grades: string[];
  regimes: string[];
  flows: string[];
  btcStates: string[];
  rsiZones: string[];
  rsiEdges: string[];
  obBiases: string[];
  obRelations: string[];
  spreadBuckets: string[];
  depthBuckets: string[];
};

export type CohortRow = {
  score: number;
  cohortKey: string;
  label: string;

  trades: number;
  closed: number;
  sample: number;
  count: number;

  wins: number;
  losses: number;
  flats: number;

  winrate: number;
  wilson: number;

  totalR: number;
  avgR: number;
  pnlPct: number;
  avgPnlPct: number;
  profitFactor: number | null;

  directSlPct: number;
  nearTpPct: number;

  setupClass: string;
  side: string;
  entryReason: string;
  reason: string;
  grade: string;
  regime: string;
  flow: string;
  btcState: string;
  rsiZone: string;
  rsiEdge: string;
  obBias: string;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;

  symbols: string[];
};

export type ExclusiveGroupRow = CohortRow & {
  groupId: string;
  groupRank: number;
  patternName: string;
  fixedFilters: Record<string, string | number | boolean | null>;
  mixedFilters: Record<string, Record<string, number>>;
  tradeIds: string[];
};

export type BreakdownRow = {
  dimension: string;
  value: string;

  count: number;
  events: number;
  trades: number;
  closed: number;

  entries: number;
  exits: number;
  rejects: number;
  snapshots: number;
  holds: number;

  wins: number;
  losses: number;
  flats: number;

  winrate: number;
  wilson: number;

  totalR: number;
  avgR: number;
  pnlPct: number;
  avgPnlPct: number;
  profitFactor: number | null;

  directSlPct: number;
  nearTpPct: number;

  examples: string;
};

export type RecentTradeCell = string | number | boolean | null;

export type RecentTradeRow = {
  id: string;
  eventId: string;
  tradeId: string | null;

  ts: number;
  receivedAt: number | null;
  date: string;

  eventType: string;
  action: string;
  reason: string;

  symbol: string | null;
  side: string | null;

  setupClass: string | null;
  grade: string | null;

  entry: number | null;
  sl: number | null;
  initialSl: number | null;
  tp: number | null;
  exit: number | null;

  rr: number | null;
  plannedRR: number | null;
  baseRR: number | null;
  finalRr: number | null;
  exitR: number | null;
  pnlPct: number | null;

  score: number | null;
  confluence: number | null;
  sniperScore: number | null;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;
  rsiEdge: string | null;

  obBias: string | null;
  obRelation: string | null;
  spreadPct: number | null;
  spreadBps: number | null;
  spreadBucket: string | null;
  depthMinUsd1p: number | null;
  depthBucket: string | null;

  flow: string | null;
  btcState: string | null;
  regime: string | null;

  mfeR: number | null;
  maeR: number | null;
  currentR: number | null;

  directToSL: boolean;
  nearTpSeen: boolean;
  reachedHalfR: boolean;
  reachedOneR: boolean;
  breakEvenActivated: boolean;
  breakEvenStop: boolean;

  strategyVersion: string | null;
  runId: string | null;

  [key: string]: RecentTradeCell;
};

export type DashboardData = {
  overview: Overview;
  options: DashboardOptions;
  cohorts: CohortRow[];

  exclusiveGroupsLong: ExclusiveGroupRow[];
  exclusiveGroupsShort: ExclusiveGroupRow[];

  breakdown: BreakdownRow[];
  recentTrades: RecentTradeRow[];
  rawEvents: TradeEvent[];
};

type AnyRecord = Record<string, unknown>;

export type ClosedTrade = {
  tradeId: string;
  entry: TradeEvent | null;
  exit: TradeEvent;
};

type Metrics = {
  trades: number;
  closed: number;
  wins: number;
  losses: number;
  flats: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  avgPnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;
};

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPath(obj: unknown, path: string): unknown {
  if (!isRecord(obj)) return undefined;

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }

  return current;
}

function firstValue(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function tradeValue(trade: ClosedTrade, paths: string[], fallback: unknown = null): unknown {
  const fromEntry = trade.entry ? firstValue(trade.entry, paths, undefined) : undefined;

  if (fromEntry !== undefined && fromEntry !== null && fromEntry !== "") {
    return fromEntry;
  }

  const fromExit = firstValue(trade.exit, paths, undefined);

  if (fromExit !== undefined && fromExit !== null && fromExit !== "") {
    return fromExit;
  }

  return fallback;
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  const result = String(value).trim();
  return result || fallback;
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function upper(value: unknown, fallback = ""): string {
  return text(value, fallback).toUpperCase();
}

function lower(value: unknown, fallback = ""): string {
  return text(value, fallback).toLowerCase();
}

function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function percentInputToRatio(value: unknown, fallback = 0): number {
  const n = num(value, fallback);

  if (!Number.isFinite(n) || n <= 0) return 0;

  return n > 1 ? n / 100 : n;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  const v = lower(value);
  return ["true", "1", "yes", "y", "on"].includes(v);
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => text(value))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function parseDateMs(value: string): number | null {
  if (!value) return null;

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function eventTime(event: TradeEvent): number {
  const value = firstValue(event, [
    "ts",
    "createdAt",
    "receivedAt",
    "storedAt",
    "payload.ts",
    "payload.createdAt",
    "payload.receivedAt"
  ]);

  const n = nullableNum(value);

  if (n !== null && n > 1_000_000_000_000) return n;
  if (n !== null && n > 1_000_000_000) return n * 1000;

  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEventType(event: TradeEvent): string {
  const raw = upper(
    firstValue(event, [
      "eventType",
      "type",
      "action",
      "payload.eventType",
      "payload.type",
      "payload.action"
    ]),
    "UNKNOWN"
  );

  if (raw.includes("ENTRY")) return "ENTRY";
  if (raw.includes("ENTER")) return "ENTRY";
  if (raw.includes("OPEN_TRADE")) return "ENTRY";
  if (raw === "OPEN") return "ENTRY";

  if (raw.includes("EXIT")) return "EXIT";
  if (raw.includes("CLOSE")) return "EXIT";
  if (raw.includes("CLOSED")) return "EXIT";

  if (raw.includes("REJECT")) return "REJECT";
  if (raw.includes("WAIT")) return "REJECT";
  if (raw.includes("SKIP")) return "REJECT";
  if (raw.includes("FILTER_FAIL")) return "REJECT";

  if (raw.includes("SNAPSHOT")) return "SNAPSHOT";
  if (raw.includes("HOLD")) return "HOLD";

  return raw;
}

function normalizedSide(value: unknown): string {
  const raw = upper(value, "UNKNOWN");

  if (["BULL", "LONG", "BUY", "BULLISH"].includes(raw)) return "LONG";
  if (["BEAR", "SHORT", "SELL", "BEARISH"].includes(raw)) return "SHORT";

  return raw;
}

function getTradeId(event: TradeEvent): string | null {
  const value = firstValue(event, [
    "tradeId",
    "id",
    "signalId",
    "payload.tradeId",
    "payload.id",
    "payload.signalId"
  ]);

  const id = text(value);
  return id || null;
}

function isEntry(event: TradeEvent): boolean {
  return normalizeEventType(event) === "ENTRY";
}

function isExit(event: TradeEvent): boolean {
  return normalizeEventType(event) === "EXIT";
}

function eventFilterSnapshot(event: TradeEvent): AnyRecord | null {
  const snapshot = firstValue(event, ["filterSnapshot", "payload.filterSnapshot"], null);
  return isRecord(snapshot) ? snapshot : null;
}

function filterSnapshotOf(trade: ClosedTrade): AnyRecord | null {
  const fromEntry = trade.entry
    ? firstValue(trade.entry, ["filterSnapshot", "payload.filterSnapshot"], null)
    : null;

  if (isRecord(fromEntry)) return fromEntry;

  const fromExit = firstValue(trade.exit, ["filterSnapshot", "payload.filterSnapshot"], null);

  return isRecord(fromExit) ? fromExit : null;
}

function snapshotFirstValue(
  trade: ClosedTrade,
  paths: string[],
  fallback: unknown = null
): unknown {
  const snapshot = filterSnapshotOf(trade);

  if (snapshot) {
    for (const path of paths) {
      const value = readPath(snapshot, path);

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return fallback;
}

function eventSnapshotFirstValue(
  event: TradeEvent,
  paths: string[],
  fallback: unknown = null
): unknown {
  const snapshot = eventFilterSnapshot(event);

  if (snapshot) {
    for (const path of paths) {
      const value = readPath(snapshot, path);

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return fallback;
}

export function parseDashboardFilters(params: SearchParams = {}): DashboardFilters {
  return {
    strategyVersion: one(params.strategyVersion || params.strategy || params.version),
    symbol: upper(one(params.symbol)),
    side: lower(one(params.side)),
    eventType: upper(one(params.eventType || params.type)),
    reason: upper(one(params.reason)),
    setupClass: upper(one(params.setupClass || params.setup)),
    grade: upper(one(params.grade)),
    regime: upper(one(params.regime)),
    flow: upper(one(params.flow)),
    btcState: upper(one(params.btcState)),
    rsiZone: upper(one(params.rsiZone)),
    rsiEdge: upper(one(params.rsiEdge)),
    obBias: upper(one(params.obBias)),
    obRelation: upper(one(params.obRelation)),
    spreadBucket: upper(one(params.spreadBucket)),
    depthBucket: upper(one(params.depthBucket)),
    outcome: upper(one(params.outcome)),
    from: one(params.from),
    to: one(params.to),

    minTrades: one(params.minTrades) || "5",
    minWilson: one(params.minWilson) || "0",
    minWinrate: one(params.minWinrate) || "0",

    winrateWeight: one(params.winrateWeight) || "1",
    wilsonWeight: one(params.wilsonWeight) || "1",
    pnlWeight: one(params.pnlWeight) || "1",
    avgRWeight: one(params.avgRWeight) || "1",
    profitFactorWeight: one(params.profitFactorWeight) || "0.5",
    nearTpWeight: one(params.nearTpWeight) || one(params.nearTpBonus) || "0.25",
    nearTpBonus: one(params.nearTpBonus) || one(params.nearTpWeight) || "0.25",
    directSlPenalty: one(params.directSlPenalty) || "0.5"
  };
}

function buildEntryIndex(events: TradeEvent[]): Map<string, TradeEvent> {
  const entries = events
    .filter(isEntry)
    .sort((a, b) => eventTime(a) - eventTime(b));

  const map = new Map<string, TradeEvent>();

  for (const entry of entries) {
    const tradeId = getTradeId(entry);
    if (!tradeId) continue;

    map.set(tradeId, entry);
  }

  return map;
}

function buildClosedTrades(events: TradeEvent[]): ClosedTrade[] {
  const entryIndex = buildEntryIndex(events);

  return events
    .filter(isExit)
    .map(exit => {
      const tradeId = getTradeId(exit) || text(exit.eventId);
      const entry = tradeId ? entryIndex.get(tradeId) || null : null;

      return {
        tradeId,
        entry,
        exit
      };
    });
}

function symbolOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["identity.symbol"],
      tradeValue(trade, ["symbol", "payload.symbol"])
    ),
    "UNKNOWN"
  );
}

function sideOf(trade: ClosedTrade): string {
  return normalizedSide(
    snapshotFirstValue(
      trade,
      ["identity.side"],
      tradeValue(trade, ["side", "payload.side"])
    )
  );
}

function setupClassOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["identity.setupClass"],
      tradeValue(trade, ["setupClass", "payload.setupClass", "payload.setup.setupClass"])
    ),
    "UNKNOWN"
  );
}

function gradeOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["identity.grade"],
      tradeValue(trade, ["grade", "payload.grade", "payload.setup.grade"])
    ),
    "UNKNOWN"
  );
}

function entryReasonOf(trade: ClosedTrade): string {
  const value = upper(
    snapshotFirstValue(
      trade,
      ["identity.entryReason"],
      trade.entry
        ? firstValue(trade.entry, [
            "entryReason",
            "payload.entryReason",
            "payload.setup.entryReason",
            "reason",
            "payload.reason"
          ])
        : firstValue(trade.exit, [
            "entryReason",
            "payload.entryReason",
            "payload.setup.entryReason"
          ])
    ),
    "UNKNOWN"
  );

  if (["TP", "SL", "STOP", "STOPLOSS", "TAKE_PROFIT"].includes(value)) {
    return "UNKNOWN";
  }

  return value;
}

function exitReasonOf(trade: ClosedTrade): string {
  return upper(
    firstValue(trade.exit, ["exitReason", "payload.exitReason", "reason", "payload.reason"]),
    "UNKNOWN"
  );
}

function rsiZoneOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["rsi.rsiZone"],
      tradeValue(trade, ["rsiZone", "payload.rsiZone", "payload.rsi.rsiZone"])
    ),
    "UNKNOWN"
  );
}

function rsiEdgeOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["rsi.rsiEdge"],
      tradeValue(trade, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge"])
    ),
    "UNKNOWN"
  );
}

function flowOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["market.flow"],
      tradeValue(trade, ["flow", "payload.flow", "payload.market.flow"])
    ),
    "UNKNOWN"
  );
}

function btcStateOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["market.btcState"],
      tradeValue(trade, ["btcState", "payload.btcState", "payload.market.btcState"])
    ),
    "UNKNOWN"
  );
}

function regimeOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["market.regime"],
      tradeValue(trade, ["regime", "payload.regime", "payload.market.regime"])
    ),
    "UNKNOWN"
  );
}

function obBiasOf(trade: ClosedTrade): string {
  return upper(
    snapshotFirstValue(
      trade,
      ["orderbook.obBias"],
      tradeValue(trade, ["obBias", "payload.obBias", "payload.ob.bias", "payload.orderbook.bias"])
    ),
    "UNKNOWN"
  );
}

function deriveObRelation(side: string, obBias: string, fallback = "UNKNOWN"): string {
  const s = upper(side);
  const ob = upper(obBias);

  if (ob === "NEUTRAL" || ob === "UNKNOWN") return "NEUTRAL";
  if (s === "LONG" && ob === "BULLISH") return "WITH";
  if (s === "SHORT" && ob === "BEARISH") return "WITH";
  if (s === "LONG" && ob === "BEARISH") return "AGAINST";
  if (s === "SHORT" && ob === "BULLISH") return "AGAINST";

  return fallback || ob || "UNKNOWN";
}

function obRelationOf(trade: ClosedTrade): string {
  const explicit = upper(
    snapshotFirstValue(
      trade,
      ["orderbook.obRelation"],
      tradeValue(trade, [
        "obRelation",
        "payload.obRelation",
        "payload.ob.relation",
        "payload.orderbook.relation"
      ])
    ),
    ""
  );

  if (explicit && !["BULLISH", "BEARISH"].includes(explicit)) return explicit;

  return deriveObRelation(sideOf(trade), obBiasOf(trade), explicit || obBiasOf(trade));
}

function spreadBpsFromBucket(bucket: string): number | null {
  if (bucket === "SPREAD_LT_2BPS") return 2;
  if (bucket === "SPREAD_LE_5BPS") return 5;
  if (bucket === "SPREAD_2_5BPS") return 5;
  if (bucket === "SPREAD_5_8BPS") return 8;
  if (bucket === "SPREAD_8_12BPS") return 12;
  if (bucket === "SPREAD_12_25BPS") return 25;
  if (bucket === "SPREAD_GTE_25BPS") return 999;
  if (bucket === "SPREAD_GT_25BPS") return 999;

  return null;
}

function depthUsdFromBucket(bucket: string): number | null {
  if (bucket === "DEPTH_LT_50K") return 0;
  if (bucket === "DEPTH_50K_100K") return 50_000;
  if (bucket === "DEPTH_100K_200K") return 100_000;
  if (bucket === "DEPTH_200K_500K") return 200_000;
  if (bucket === "DEPTH_500K_1M") return 500_000;
  if (bucket === "DEPTH_GTE_1M") return 1_000_000;

  return null;
}

function spreadBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    snapshotFirstValue(
      trade,
      ["orderbook.spreadBucket"],
      tradeValue(trade, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"])
    ),
    ""
  );

  if (explicit) return explicit;

  const spreadBps = nullableNum(
    snapshotFirstValue(
      trade,
      ["orderbook.spreadBps"],
      tradeValue(trade, ["spreadBps", "payload.spreadBps", "payload.ob.spreadBps"])
    )
  );

  const spreadPct = nullableNum(
    snapshotFirstValue(
      trade,
      ["orderbook.spreadPct"],
      tradeValue(trade, ["spreadPct", "payload.spreadPct", "payload.ob.spreadPct"])
    )
  );

  const bps = spreadBps ?? (spreadPct !== null ? spreadPct * 10000 : null);

  if (bps === null) return "SPREAD_NA";
  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    snapshotFirstValue(
      trade,
      ["orderbook.depthBucket"],
      tradeValue(trade, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"])
    ),
    ""
  );

  if (explicit) return explicit;

  const depth = nullableNum(
    snapshotFirstValue(
      trade,
      ["orderbook.depthMinUsd1p"],
      tradeValue(trade, [
        "depthMinUsd1p",
        "depthUsd1p",
        "payload.depthMinUsd1p",
        "payload.depthUsd1p",
        "payload.ob.depthMinUsd1p"
      ])
    )
  );

  if (depth === null) return "DEPTH_NA";
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function scoreBucket(value: unknown, label: string): string {
  const n = nullableNum(value);

  if (n === null) return `${label}_NA`;
  if (n >= 95) return `${label}_95_100`;
  if (n >= 90) return `${label}_90_95`;
  if (n >= 85) return `${label}_85_90`;
  if (n >= 80) return `${label}_80_85`;
  if (n >= 70) return `${label}_70_80`;
  if (n >= 60) return `${label}_60_70`;

  return `${label}_LT_60`;
}

function scoreLowerFromBucket(bucket: string): number | null {
  if (bucket.includes("_95_100")) return 95;
  if (bucket.includes("_90_95")) return 90;
  if (bucket.includes("_85_90")) return 85;
  if (bucket.includes("_80_85")) return 80;
  if (bucket.includes("_70_80")) return 70;
  if (bucket.includes("_60_70")) return 60;
  if (bucket.includes("_LT_60")) return 0;

  return null;
}

function rrBucket(value: unknown): string {
  const n = nullableNum(value);

  if (n === null) return "RR_NA";
  if (n >= 2) return "RR_GTE_2";
  if (n >= 1.75) return "RR_1P75_2P00";
  if (n >= 1.5) return "RR_1P50_1P75";
  if (n >= 1.25) return "RR_1P25_1P50";
  if (n >= 1) return "RR_1P00_1P25";
  if (n >= 0.75) return "RR_0P75_1P00";
  if (n >= 0.5) return "RR_0P50_0P75";
  if (n >= 0.2) return "RR_0P20_0P50";

  return "RR_LT_0P20";
}

function confluenceBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    snapshotFirstValue(trade, ["confluence.confluenceBucket"], ""),
    ""
  );

  if (explicit) return explicit;

  return scoreBucket(
    tradeValue(trade, [
      "confluence",
      "effectiveConfluence",
      "payload.confluence",
      "payload.scores.confluence"
    ]),
    "CONF"
  );
}

function sniperBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    snapshotFirstValue(trade, ["sniper.sniperBucket"], ""),
    ""
  );

  if (explicit) return explicit;

  return scoreBucket(
    tradeValue(trade, [
      "sniperScore",
      "fallbackSniperScore",
      "payload.sniperScore",
      "payload.scores.sniperScore"
    ]),
    "SNIPER"
  );
}

function rrBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    snapshotFirstValue(trade, ["rr.finalRRBucket"], ""),
    ""
  );

  if (explicit) return explicit;

  return rrBucket(
    tradeValue(trade, [
      "finalRr",
      "finalRR",
      "plannedRR",
      "rr",
      "payload.finalRr",
      "payload.finalRR",
      "payload.plannedRR",
      "payload.rr.finalRr"
    ])
  );
}

function confluenceValueOf(trade: ClosedTrade): number | null {
  const explicit = nullableNum(
    snapshotFirstValue(
      trade,
      ["confluence.effectiveConfluence"],
      tradeValue(trade, [
        "confluence",
        "effectiveConfluence",
        "payload.confluence",
        "payload.scores.confluence"
      ])
    )
  );

  if (explicit !== null) return explicit;
  return scoreLowerFromBucket(confluenceBucketOf(trade));
}

function sniperValueOf(trade: ClosedTrade): number | null {
  const explicit = nullableNum(
    snapshotFirstValue(
      trade,
      ["sniper.sniperScore"],
      tradeValue(trade, [
        "sniperScore",
        "fallbackSniperScore",
        "payload.sniperScore",
        "payload.scores.sniperScore"
      ])
    )
  );

  if (explicit !== null) return explicit;
  return scoreLowerFromBucket(sniperBucketOf(trade));
}

function spreadBpsOf(trade: ClosedTrade): number | null {
  const spreadBps = nullableNum(
    snapshotFirstValue(
      trade,
      ["orderbook.spreadBps"],
      tradeValue(trade, ["spreadBps", "payload.spreadBps", "payload.ob.spreadBps"])
    )
  );

  if (spreadBps !== null) return spreadBps;

  const spreadPct = nullableNum(
    snapshotFirstValue(
      trade,
      ["orderbook.spreadPct"],
      tradeValue(trade, ["spreadPct", "payload.spreadPct", "payload.ob.spreadPct"])
    )
  );

  if (spreadPct !== null) return spreadPct * 10000;

  return spreadBpsFromBucket(spreadBucketOf(trade));
}

function depthUsdOf(trade: ClosedTrade): number | null {
  const depth = nullableNum(
    snapshotFirstValue(
      trade,
      ["orderbook.depthMinUsd1p"],
      tradeValue(trade, [
        "depthMinUsd1p",
        "depthUsd1p",
        "payload.depthMinUsd1p",
        "payload.depthUsd1p",
        "payload.ob.depthMinUsd1p"
      ])
    )
  );

  if (depth !== null) return depth;
  return depthUsdFromBucket(depthBucketOf(trade));
}

function groupedConfluenceLabel(trade: ClosedTrade): string {
  const value = confluenceValueOf(trade);

  if (value === null) return "CONF=NA";
  if (value < 60) return "CONF<60";
  if (value < 70) return "CONF_60_70";

  return "CONF>=70";
}

function groupedSniperLabel(trade: ClosedTrade): string {
  const value = sniperValueOf(trade);

  if (value === null) return "SNIPER=NA";
  if (value < 60) return "SNIPER<60";
  if (value < 70) return "SNIPER_60_70";

  return "SNIPER>=70";
}

function groupedSpreadLabel(trade: ClosedTrade): string {
  const value = spreadBpsOf(trade);

  if (value === null) return "SPREAD=NA";
  if (value <= 12) return "SPREAD<=12BPS";
  if (value <= 25) return "SPREAD_12_25BPS";

  return "SPREAD>25BPS";
}

function groupedDepthLabel(trade: ClosedTrade): string {
  const value = depthUsdOf(trade);

  if (value === null) return "DEPTH=NA";
  if (value < 50_000) return "DEPTH<50K";
  if (value < 200_000) return "DEPTH_50K_200K";

  return "DEPTH>=200K";
}

function sideTotalCohortKeyOf(trade: ClosedTrade): string {
  return [
    "MODE=SIDE_TOTAL",
    `SETUP=${setupClassOf(trade)}`,
    `SIDE=${sideOf(trade)}`,
    `GRADE=${gradeOf(trade)}`
  ].join("|");
}

function setupSideCohortKeyOf(trade: ClosedTrade): string {
  return [
    "MODE=SETUP_SIDE",
    `SETUP=${setupClassOf(trade)}`,
    `SIDE=${sideOf(trade)}`,
    `GRADE=${gradeOf(trade)}`,
    `FLOW=${flowOf(trade)}`,
    `OB=${obRelationOf(trade)}`
  ].join("|");
}

function groupedCohortKeyOf(trade: ClosedTrade): string {
  return [
    "MODE=GROUPED",
    `SETUP=${setupClassOf(trade)}`,
    `SIDE=${sideOf(trade)}`,
    `GRADE=${gradeOf(trade)}`,
    `RSI=${rsiZoneOf(trade)}`,
    `FLOW=${flowOf(trade)}`,
    `BTC=${btcStateOf(trade)}`,
    `OB=${obRelationOf(trade)}`,
    rrBucketOf(trade),
    groupedConfluenceLabel(trade),
    groupedSniperLabel(trade),
    groupedSpreadLabel(trade),
    groupedDepthLabel(trade)
  ].join("|");
}

function cohortKeysOf(trade: ClosedTrade): string[] {
  return [
    groupedCohortKeyOf(trade),
    setupSideCohortKeyOf(trade),
    sideTotalCohortKeyOf(trade)
  ];
}

function keyPart(key: string, prefix: string, fallback = "UNKNOWN"): string {
  const found = key
    .split("|")
    .find(part => part.startsWith(prefix));

  if (!found) return fallback;

  if (found.includes("=")) {
    return found.split("=").slice(1).join("=") || fallback;
  }

  return found || fallback;
}

function exitROf(trade: ClosedTrade): number | null {
  return nullableNum(firstValue(trade.exit, ["exitR", "payload.exitR", "outcome.exitR"]));
}

function pnlPctOf(trade: ClosedTrade): number | null {
  return nullableNum(
    firstValue(trade.exit, ["pnlPct", "pnl", "payload.pnlPct", "payload.pnl", "outcome.pnlPct"])
  );
}

function directSlOf(trade: ClosedTrade): boolean {
  return bool(firstValue(trade.exit, ["directToSL", "payload.directToSL"]));
}

function nearTpOf(trade: ClosedTrade): boolean {
  return bool(firstValue(trade.exit, ["nearTpSeen", "payload.nearTpSeen"]));
}

function outcomeOf(trade: ClosedTrade): string {
  const reason = exitReasonOf(trade);
  const rValue = exitROf(trade);

  if (reason.includes("TP")) return "TP";
  if (reason.includes("SL") || reason.includes("STOP")) return "SL";
  if (rValue !== null && rValue > 0) return "WIN";
  if (rValue !== null && rValue < 0) return "LOSS";

  return "FLAT";
}

function wilsonLowerBound(wins: number, total: number, z = 1.96): number {
  if (!total) return 0;

  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return Math.max(0, (center - margin) / denom);
}

function profitFactor(values: number[]): number | null {
  const grossWin = values
    .filter(value => value > 0)
    .reduce((sum, value) => sum + value, 0);

  const grossLoss = Math.abs(
    values
      .filter(value => value < 0)
      .reduce((sum, value) => sum + value, 0)
  );

  if (!grossWin && !grossLoss) return null;
  if (!grossLoss) return 999;

  return grossWin / grossLoss;
}

function summarizeTrades(trades: ClosedTrade[]): Metrics {
  const valuesR = trades
    .map(exitROf)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const pnlValues = trades
    .map(pnlPctOf)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const wins = trades.filter(trade => {
    const rValue = exitROf(trade);
    if (rValue !== null) return rValue > 0;

    const pnl = pnlPctOf(trade);
    return pnl !== null && pnl > 0;
  }).length;

  const losses = trades.filter(trade => {
    const rValue = exitROf(trade);
    if (rValue !== null) return rValue < 0;

    const pnl = pnlPctOf(trade);
    return pnl !== null && pnl < 0;
  }).length;

  const flats = Math.max(0, trades.length - wins - losses);
  const completed = wins + losses;

  const totalR = valuesR.reduce((sum, value) => sum + value, 0);
  const pnlPct = pnlValues.reduce((sum, value) => sum + value, 0);

  const directSlCount = trades.filter(directSlOf).length;
  const nearTpCount = trades.filter(nearTpOf).length;

  return {
    trades: trades.length,
    closed: trades.length,

    wins,
    losses,
    flats,

    winrate: completed ? wins / completed : 0,
    wilson: wilsonLowerBound(wins, completed),

    totalR: round(totalR, 3),
    avgR: valuesR.length ? round(totalR / valuesR.length, 3) : 0,

    pnlPct: round(pnlPct, 3),
    avgPnlPct: pnlValues.length ? round(pnlPct / pnlValues.length, 3) : 0,

    profitFactor: (() => {
      const pf = profitFactor(valuesR);
      return pf === null ? null : round(pf, 3);
    })(),

    directSlPct: trades.length ? directSlCount / trades.length : 0,
    nearTpPct: trades.length ? nearTpCount / trades.length : 0
  };
}

function optimizerScore(metrics: Metrics, filters: DashboardFilters): number {
  const winrateWeight = num(filters.winrateWeight, 1);
  const wilsonWeight = num(filters.wilsonWeight, 1);
  const pnlWeight = num(filters.pnlWeight, 1);
  const avgRWeight = num(filters.avgRWeight, 1);
  const profitFactorWeight = num(filters.profitFactorWeight, 0.5);
  const nearTpWeight = num(filters.nearTpWeight || filters.nearTpBonus, 0.25);
  const directSlPenalty = num(filters.directSlPenalty, 0.5);

  const pf = metrics.profitFactor ?? 0;

  const score =
    metrics.winrate * 100 * winrateWeight +
    metrics.wilson * 100 * wilsonWeight +
    clamp(metrics.avgR, -2, 3) * 25 * avgRWeight +
    clamp(metrics.totalR, -10, 20) * 4 * pnlWeight +
    clamp(pf, 0, 5) * 8 * profitFactorWeight +
    metrics.nearTpPct * 100 * nearTpWeight -
    metrics.directSlPct * 100 * directSlPenalty;

  return round(score, 2);
}

function tradePassesFilters(trade: ClosedTrade, filters: DashboardFilters): boolean {
  if (filters.strategyVersion) {
    const version = text(
      snapshotFirstValue(
        trade,
        ["strategyVersion"],
        tradeValue(trade, ["strategyVersion", "payload.strategyVersion"])
      )
    );

    if (version !== filters.strategyVersion) return false;
  }

  if (filters.symbol && symbolOf(trade) !== filters.symbol) return false;
  if (filters.side && lower(sideOf(trade)) !== filters.side) return false;
  if (filters.reason && exitReasonOf(trade) !== filters.reason) return false;
  if (filters.setupClass && setupClassOf(trade) !== filters.setupClass) return false;
  if (filters.grade && gradeOf(trade) !== filters.grade) return false;
  if (filters.regime && regimeOf(trade) !== filters.regime) return false;
  if (filters.flow && flowOf(trade) !== filters.flow) return false;
  if (filters.btcState && btcStateOf(trade) !== filters.btcState) return false;
  if (filters.rsiZone && rsiZoneOf(trade) !== filters.rsiZone) return false;
  if (filters.rsiEdge && rsiEdgeOf(trade) !== filters.rsiEdge) return false;
  if (filters.obBias && obBiasOf(trade) !== filters.obBias) return false;
  if (filters.obRelation && obRelationOf(trade) !== filters.obRelation) return false;
  if (filters.spreadBucket && spreadBucketOf(trade) !== filters.spreadBucket) return false;
  if (filters.depthBucket && depthBucketOf(trade) !== filters.depthBucket) return false;

  if (filters.outcome) {
    const outcome = outcomeOf(trade);

    if (filters.outcome === "WIN" && !["WIN", "TP"].includes(outcome)) return false;
    if (filters.outcome === "LOSS" && !["LOSS", "SL"].includes(outcome)) return false;

    if (
      filters.outcome !== "WIN" &&
      filters.outcome !== "LOSS" &&
      outcome !== filters.outcome
    ) {
      return false;
    }
  }

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);
  const exitTs = eventTime(trade.exit);

  if (fromMs !== null && exitTs < fromMs) return false;
  if (toMs !== null && exitTs > toMs) return false;

  return true;
}

function eventPassesEntryFilters(event: TradeEvent, filters: DashboardFilters): boolean {
  if (filters.strategyVersion) {
    const version = text(
      eventSnapshotFirstValue(
        event,
        ["strategyVersion"],
        firstValue(event, ["strategyVersion", "payload.strategyVersion"])
      )
    );

    if (version !== filters.strategyVersion) return false;
  }

  if (filters.symbol) {
    const symbol = upper(
      eventSnapshotFirstValue(
        event,
        ["identity.symbol"],
        firstValue(event, ["symbol", "payload.symbol"])
      )
    );

    if (symbol !== filters.symbol) return false;
  }

  if (filters.side) {
    const side = lower(
      normalizedSide(
        eventSnapshotFirstValue(
          event,
          ["identity.side"],
          firstValue(event, ["side", "payload.side"])
        )
      )
    );

    if (side !== filters.side) return false;
  }

  if (filters.setupClass) {
    const setupClass = upper(
      eventSnapshotFirstValue(
        event,
        ["identity.setupClass"],
        firstValue(event, ["setupClass", "payload.setupClass", "payload.setup.setupClass"])
      )
    );

    if (setupClass !== filters.setupClass) return false;
  }

  if (filters.grade) {
    const grade = upper(
      eventSnapshotFirstValue(
        event,
        ["identity.grade"],
        firstValue(event, ["grade", "payload.grade", "payload.setup.grade"])
      )
    );

    if (grade !== filters.grade) return false;
  }

  if (filters.regime) {
    const regime = upper(
      eventSnapshotFirstValue(
        event,
        ["market.regime"],
        firstValue(event, ["regime", "payload.regime", "payload.market.regime"])
      )
    );

    if (regime !== filters.regime) return false;
  }

  if (filters.flow) {
    const flow = upper(
      eventSnapshotFirstValue(
        event,
        ["market.flow"],
        firstValue(event, ["flow", "payload.flow", "payload.market.flow"])
      )
    );

    if (flow !== filters.flow) return false;
  }

  if (filters.btcState) {
    const btcState = upper(
      eventSnapshotFirstValue(
        event,
        ["market.btcState"],
        firstValue(event, ["btcState", "payload.btcState", "payload.market.btcState"])
      )
    );

    if (btcState !== filters.btcState) return false;
  }

  if (filters.rsiZone) {
    const rsiZone = upper(
      eventSnapshotFirstValue(
        event,
        ["rsi.rsiZone"],
        firstValue(event, ["rsiZone", "payload.rsiZone", "payload.rsi.rsiZone"])
      )
    );

    if (rsiZone !== filters.rsiZone) return false;
  }

  if (filters.rsiEdge) {
    const rsiEdge = upper(
      eventSnapshotFirstValue(
        event,
        ["rsi.rsiEdge"],
        firstValue(event, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge"])
      )
    );

    if (rsiEdge !== filters.rsiEdge) return false;
  }

  if (filters.obBias) {
    const obBias = upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.obBias"],
        firstValue(event, ["obBias", "payload.obBias", "payload.ob.bias"])
      )
    );

    if (obBias !== filters.obBias) return false;
  }

  if (filters.obRelation) {
    const obRelation = upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.obRelation"],
        firstValue(event, ["obRelation", "payload.obRelation", "payload.ob.relation"])
      )
    );

    if (obRelation !== filters.obRelation) return false;
  }

  if (filters.spreadBucket) {
    const spreadBucket = upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.spreadBucket"],
        firstValue(event, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"], "")
      )
    );

    if (spreadBucket !== filters.spreadBucket) return false;
  }

  if (filters.depthBucket) {
    const depthBucket = upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.depthBucket"],
        firstValue(event, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"], "")
      )
    );

    if (depthBucket !== filters.depthBucket) return false;
  }

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);
  const ts = eventTime(event);

  if (fromMs !== null && ts < fromMs) return false;
  if (toMs !== null && ts > toMs) return false;

  return true;
}

function rawEventPassesFilters(event: TradeEvent, filters: DashboardFilters): boolean {
  if (filters.strategyVersion) {
    const version = text(
      eventSnapshotFirstValue(
        event,
        ["strategyVersion"],
        firstValue(event, ["strategyVersion", "payload.strategyVersion"])
      )
    );

    if (version !== filters.strategyVersion) return false;
  }

  if (filters.eventType && normalizeEventType(event) !== filters.eventType) return false;

  if (filters.symbol) {
    const symbol = upper(
      eventSnapshotFirstValue(
        event,
        ["identity.symbol"],
        firstValue(event, ["symbol", "payload.symbol"])
      )
    );

    if (symbol !== filters.symbol) return false;
  }

  if (filters.side) {
    const side = lower(
      normalizedSide(
        eventSnapshotFirstValue(
          event,
          ["identity.side"],
          firstValue(event, ["side", "payload.side"])
        )
      )
    );

    if (side !== filters.side) return false;
  }

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);
  const ts = eventTime(event);

  if (fromMs !== null && ts < fromMs) return false;
  if (toMs !== null && ts > toMs) return false;

  return true;
}

function buildOverview(
  events: TradeEvent[],
  closedTrades: ClosedTrade[],
  filters: DashboardFilters
): Overview {
  const metrics = summarizeTrades(closedTrades);

  const eventTypes = events.map(normalizeEventType);

  const totalEvents = events.length;
  const entryEvents = eventTypes.filter(type => type === "ENTRY").length;
  const exitEvents = eventTypes.filter(type => type === "EXIT").length;
  const rejects = eventTypes.filter(type => type === "REJECT").length;
  const snapshots = eventTypes.filter(type => type === "SNAPSHOT").length;
  const holds = eventTypes.filter(type => type === "HOLD").length;

  const closedIds = new Set(
    closedTrades
      .map(trade => trade.tradeId)
      .filter(Boolean)
  );

  const entryIds = new Set<string>();

  if (!filters.outcome) {
    for (const event of events) {
      if (!isEntry(event)) continue;
      if (!eventPassesEntryFilters(event, filters)) continue;

      const tradeId = getTradeId(event) || text(event.eventId);
      if (!tradeId) continue;

      entryIds.add(tradeId);
    }
  }

  for (const tradeId of closedIds) {
    entryIds.add(tradeId);
  }

  const open = filters.outcome
    ? 0
    : [...entryIds].filter(tradeId => !closedIds.has(tradeId)).length;

  return {
    entries: totalEvents,
    events: totalEvents,
    entryEvents,
    exitEvents,
    rejects,
    snapshots,
    holds,

    closed: metrics.closed,
    open,

    winrate: metrics.winrate,
    wilson: metrics.wilson,

    totalR: metrics.totalR,
    avgR: metrics.avgR,

    pnlPct: metrics.pnlPct,
    profitFactor: metrics.profitFactor,

    directSlPct: metrics.directSlPct,
    nearTpPct: metrics.nearTpPct
  };
}

function buildOptions(events: TradeEvent[]): DashboardOptions {
  const closedTrades = buildClosedTrades(events);

  return {
    strategies: uniqueSorted(
      events.map(event =>
        text(
          eventSnapshotFirstValue(
            event,
            ["strategyVersion"],
            firstValue(event, ["strategyVersion", "payload.strategyVersion"])
          )
        )
      )
    ),

    strategyVersions: uniqueSorted(
      events.map(event =>
        text(
          eventSnapshotFirstValue(
            event,
            ["strategyVersion"],
            firstValue(event, ["strategyVersion", "payload.strategyVersion"])
          )
        )
      )
    ),

    symbols: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["identity.symbol"],
            firstValue(event, ["symbol", "payload.symbol"])
          )
        )
      ),
      ...closedTrades.map(symbolOf)
    ]),

    sides: uniqueSorted([
      ...events.map(event =>
        normalizedSide(
          eventSnapshotFirstValue(
            event,
            ["identity.side"],
            firstValue(event, ["side", "payload.side"])
          )
        )
      ),
      ...closedTrades.map(sideOf)
    ]),

    eventTypes: uniqueSorted(events.map(normalizeEventType)),
    reasons: uniqueSorted(closedTrades.map(exitReasonOf)),

    setupClasses: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["identity.setupClass"],
            firstValue(event, ["setupClass", "payload.setupClass"], "")
          )
        )
      ),
      ...closedTrades.map(setupClassOf)
    ]),

    grades: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["identity.grade"],
            firstValue(event, ["grade", "payload.grade"], "")
          )
        )
      ),
      ...closedTrades.map(gradeOf)
    ]),

    regimes: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["market.regime"],
            firstValue(event, ["regime", "payload.regime", "payload.market.regime"], "")
          )
        )
      ),
      ...closedTrades.map(regimeOf)
    ]),

    flows: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["market.flow"],
            firstValue(event, ["flow", "payload.flow", "payload.market.flow"], "")
          )
        )
      ),
      ...closedTrades.map(flowOf)
    ]),

    btcStates: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["market.btcState"],
            firstValue(event, ["btcState", "payload.btcState", "payload.market.btcState"], "")
          )
        )
      ),
      ...closedTrades.map(btcStateOf)
    ]),

    rsiZones: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["rsi.rsiZone"],
            firstValue(event, ["rsiZone", "payload.rsiZone", "payload.rsi.rsiZone"], "")
          )
        )
      ),
      ...closedTrades.map(rsiZoneOf)
    ]),

    rsiEdges: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["rsi.rsiEdge"],
            firstValue(event, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge"], "")
          )
        )
      ),
      ...closedTrades.map(rsiEdgeOf)
    ]),

    obBiases: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["orderbook.obBias"],
            firstValue(event, ["obBias", "payload.obBias", "payload.ob.bias"], "")
          )
        )
      ),
      ...closedTrades.map(obBiasOf)
    ]),

    obRelations: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["orderbook.obRelation"],
            firstValue(event, ["obRelation", "payload.obRelation", "payload.ob.relation"], "")
          )
        )
      ),
      ...closedTrades.map(obRelationOf)
    ]),

    spreadBuckets: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["orderbook.spreadBucket"],
            firstValue(event, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"], "")
          )
        )
      ),
      ...closedTrades.map(spreadBucketOf)
    ]),

    depthBuckets: uniqueSorted([
      ...events.map(event =>
        upper(
          eventSnapshotFirstValue(
            event,
            ["orderbook.depthBucket"],
            firstValue(event, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"], "")
          )
        )
      ),
      ...closedTrades.map(depthBucketOf)
    ])
  };
}

function buildCohorts(trades: ClosedTrade[], filters: DashboardFilters): CohortRow[] {
  const minTrades = Math.max(1, num(filters.minTrades, 5));
  const minWilson = percentInputToRatio(filters.minWilson, 0);
  const minWinrate = percentInputToRatio(filters.minWinrate, 0);

  const map = new Map<string, ClosedTrade[]>();

  for (const trade of trades) {
    for (const key of cohortKeysOf(trade)) {
      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)!.push(trade);
    }
  }

  return Array.from(map.entries())
    .map(([cohortKey, rows]) => {
      const metrics = summarizeTrades(rows);
      const first = rows[0];

      const symbols = uniqueSorted(
        rows
          .map(symbolOf)
          .filter(symbol => symbol !== "UNKNOWN")
      );

      return {
        score: optimizerScore(metrics, filters),
        cohortKey,
        label: cohortKey,

        sample: rows.length,
        count: rows.length,

        ...metrics,

        setupClass: keyPart(cohortKey, "SETUP=", setupClassOf(first)),
        side: keyPart(cohortKey, "SIDE=", sideOf(first)),
        entryReason: "GROUPED",
        reason: "GROUPED",
        grade: keyPart(cohortKey, "GRADE=", gradeOf(first)),
        regime: keyPart(cohortKey, "REGIME=", "GROUPED"),
        flow: keyPart(cohortKey, "FLOW=", flowOf(first)),
        btcState: keyPart(cohortKey, "BTC=", btcStateOf(first)),
        rsiZone: keyPart(cohortKey, "RSI=", rsiZoneOf(first)),
        rsiEdge: "GROUPED",
        obBias: obBiasOf(first),
        obRelation: keyPart(cohortKey, "OB=", obRelationOf(first)),
        spreadBucket:
          cohortKey.split("|").find(part => part.startsWith("SPREAD")) ||
          spreadBucketOf(first),
        depthBucket:
          cohortKey.split("|").find(part => part.startsWith("DEPTH")) ||
          depthBucketOf(first),

        symbols
      };
    })
    .filter(row => {
      if (row.trades < minTrades) return false;
      if (minWilson > 0 && row.wilson < minWilson) return false;
      if (minWinrate > 0 && row.winrate < minWinrate) return false;

      return true;
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      const wilsonDiff = b.wilson - a.wilson;
      if (wilsonDiff !== 0) return wilsonDiff;

      return b.trades - a.trades;
    })
    .slice(0, 150);
}

type ExclusiveSide = "LONG" | "SHORT";

const EXCLUSIVE_GROUP_LIMIT = 10;

const BAD_EXCLUSIVE_VALUES = new Set([
  "",
  "UNKNOWN",
  "NA",
  "N/A",
  "NULL",
  "UNDEFINED",
  "ANY",
  "FUNDING_NA",
  "TF_NA",
  "CH1H_NA",
  "CH24H_NA",
  "PULLBACK_NA",
  "SPREAD_NA",
  "DEPTH_NA",
  "RR_NA",
  "CONF_NA",
  "SNIPER_NA"
]);

const EXCLUSIVE_FILTER_KEYS = [
  "setupClass",
  "side",
  "entryReason",
  "grade",
  "stage",
  "flow",
  "btcState",
  "regime",
  "counterBtc",
  "rsiZone",
  "rsiEdge",
  "obBias",
  "obRelation",
  "confluenceBucket",
  "sniperBucket",
  "baseRRBucket",
  "finalRRBucket",
  "spreadBucket",
  "depthBucket",
  "fundingBucket",
  "tfStrengthBucket",
  "change1hBucket",
  "change24hBucket",
  "pullbackBucket",
  "sweepConfirmed",
  "retestConfirmed",
  "bullishMidTrendProbe",
  "btcBullishBearException"
] as const;

type ExclusiveFilterKey = typeof EXCLUSIVE_FILTER_KEYS[number];

type ExclusivePattern = {
  name: string;
  keys: ExclusiveFilterKey[];
};

const EXCLUSIVE_PATTERNS: ExclusivePattern[] = [
  {
    name: "SETUP_SIDE_MARKET_OB",
    keys: ["setupClass", "side", "grade", "flow", "obRelation"]
  },
  {
    name: "SETUP_SIDE_RSI_FLOW_OB",
    keys: ["setupClass", "side", "grade", "rsiZone", "flow", "obRelation"]
  },
  {
    name: "SETUP_SIDE_RSI_FLOW_OB_RR",
    keys: ["setupClass", "side", "grade", "rsiZone", "flow", "obRelation", "baseRRBucket", "finalRRBucket"]
  },
  {
    name: "SETUP_SIDE_RSI_EDGE_OB_RR",
    keys: ["setupClass", "side", "grade", "rsiZone", "rsiEdge", "obRelation", "baseRRBucket", "finalRRBucket"]
  },
  {
    name: "SETUP_SIDE_SCORE_RR_EXECUTION",
    keys: ["setupClass", "side", "grade", "confluenceBucket", "sniperBucket", "baseRRBucket", "finalRRBucket", "spreadBucket", "depthBucket"]
  },
  {
    name: "SETUP_SIDE_BTC_FLOW_RSI_OB",
    keys: ["setupClass", "side", "grade", "btcState", "flow", "rsiZone", "obRelation"]
  },
  {
    name: "SETUP_SIDE_ENTRY_RSI_FLOW_OB",
    keys: ["setupClass", "side", "entryReason", "grade", "rsiZone", "flow", "obRelation"]
  },
  {
    name: "SETUP_SIDE_STRUCTURE",
    keys: ["setupClass", "side", "grade", "flow", "rsiZone", "pullbackBucket", "sweepConfirmed", "retestConfirmed"]
  },
  {
    name: "SETUP_SIDE_EXCEPTIONS",
    keys: ["setupClass", "side", "grade", "flow", "btcState", "bullishMidTrendProbe", "btcBullishBearException"]
  },
  {
    name: "SETUP_SIDE_FULL_CORE",
    keys: [
      "setupClass",
      "side",
      "entryReason",
      "grade",
      "flow",
      "btcState",
      "rsiZone",
      "rsiEdge",
      "obRelation",
      "confluenceBucket",
      "sniperBucket",
      "baseRRBucket",
      "finalRRBucket",
      "spreadBucket",
      "depthBucket"
    ]
  }
];

const EXCLUSIVE_LABELS: Record<ExclusiveFilterKey, string> = {
  setupClass: "SETUP",
  side: "SIDE",
  entryReason: "ENTRY",
  grade: "GRADE",
  stage: "STAGE",
  flow: "FLOW",
  btcState: "BTC",
  regime: "REGIME",
  counterBtc: "COUNTER_BTC",
  rsiZone: "RSI",
  rsiEdge: "EDGE",
  obBias: "OB_BIAS",
  obRelation: "OB_REL",
  confluenceBucket: "CONF",
  sniperBucket: "SNIPER",
  baseRRBucket: "BASE_RR",
  finalRRBucket: "FINAL_RR",
  spreadBucket: "SPREAD",
  depthBucket: "DEPTH",
  fundingBucket: "FUNDING",
  tfStrengthBucket: "TF",
  change1hBucket: "CH1H",
  change24hBucket: "CH24H",
  pullbackBucket: "PULLBACK",
  sweepConfirmed: "SWEEP",
  retestConfirmed: "RETEST",
  bullishMidTrendProbe: "BULL_MID_PROBE",
  btcBullishBearException: "BTC_SHORT_EXCEPTION"
};

function isBadExclusiveValue(value: unknown): boolean {
  const raw = String(value ?? "").trim().toUpperCase();

  if (BAD_EXCLUSIVE_VALUES.has(raw)) return true;
  if (raw.endsWith("_NA")) return true;
  if (raw.includes("UNKNOWN")) return true;

  return false;
}

function isBadExclusiveValueForKey(key: ExclusiveFilterKey, value: unknown): boolean {
  const raw = String(value ?? "").trim().toUpperCase();

  if (isBadExclusiveValue(raw)) return true;

  if (key === "baseRRBucket" && raw === "RR_LT_0P20") return true;
  if (key === "finalRRBucket" && raw === "RR_LT_0P20") return true;

  return false;
}

function yesNo(value: unknown): string {
  return bool(value) ? "YES" : "NO";
}

function normalizedTradeSideForGroups(trade: ClosedTrade): ExclusiveSide | "UNKNOWN" {
  const side = sideOf(trade);

  if (side === "LONG") return "LONG";
  if (side === "SHORT") return "SHORT";

  return "UNKNOWN";
}

function exclusiveFilterValue(trade: ClosedTrade, key: ExclusiveFilterKey): string {
  switch (key) {
    case "setupClass":
      return setupClassOf(trade);

    case "side":
      return sideOf(trade);

    case "entryReason":
      return entryReasonOf(trade);

    case "grade":
      return gradeOf(trade);

    case "stage":
      return upper(snapshotFirstValue(trade, ["identity.stage"], tradeValue(trade, ["stage", "payload.stage"])), "UNKNOWN");

    case "flow":
      return flowOf(trade);

    case "btcState":
      return btcStateOf(trade);

    case "regime":
      return regimeOf(trade);

    case "counterBtc":
      return upper(
        snapshotFirstValue(
          trade,
          ["market.counterBtcLabel"],
          yesNo(snapshotFirstValue(trade, ["market.counterBtc"], false))
        ),
        "NO"
      );

    case "rsiZone":
      return rsiZoneOf(trade);

    case "rsiEdge":
      return rsiEdgeOf(trade);

    case "obBias":
      return obBiasOf(trade);

    case "obRelation":
      return obRelationOf(trade);

    case "confluenceBucket":
      return confluenceBucketOf(trade);

    case "sniperBucket":
      return sniperBucketOf(trade);

    case "baseRRBucket":
      return upper(
        snapshotFirstValue(
          trade,
          ["rr.baseRRBucket"],
          rrBucket(tradeValue(trade, ["baseRR", "payload.baseRR", "payload.rr.baseRR"]))
        ),
        "RR_NA"
      );

    case "finalRRBucket":
      return rrBucketOf(trade);

    case "spreadBucket":
      return spreadBucketOf(trade);

    case "depthBucket":
      return depthBucketOf(trade);

    case "fundingBucket":
      return upper(snapshotFirstValue(trade, ["market.fundingBucket"], "FUNDING_NA"), "FUNDING_NA");

    case "tfStrengthBucket":
      return upper(snapshotFirstValue(trade, ["timeframe.tfStrengthBucket"], "TF_NA"), "TF_NA");

    case "change1hBucket":
      return upper(snapshotFirstValue(trade, ["timeframe.change1hBucket"], "CH1H_NA"), "CH1H_NA");

    case "change24hBucket":
      return upper(snapshotFirstValue(trade, ["timeframe.change24hBucket"], "CH24H_NA"), "CH24H_NA");

    case "pullbackBucket":
      return upper(snapshotFirstValue(trade, ["structure.distanceFromLocalHighBucket"], "PULLBACK_NA"), "PULLBACK_NA");

    case "sweepConfirmed":
      return upper(
        snapshotFirstValue(
          trade,
          ["structure.sweepConfirmedLabel"],
          yesNo(snapshotFirstValue(trade, ["structure.sweepConfirmed"], false))
        ),
        "NO"
      );

    case "retestConfirmed":
      return upper(
        snapshotFirstValue(
          trade,
          ["structure.retestConfirmedLabel"],
          yesNo(snapshotFirstValue(trade, ["structure.retestConfirmed"], false))
        ),
        "NO"
      );

    case "bullishMidTrendProbe":
      return upper(
        snapshotFirstValue(
          trade,
          ["exceptions.bullishMidTrendProbeLabel"],
          yesNo(snapshotFirstValue(trade, ["exceptions.bullishMidTrendProbe"], false))
        ),
        "NO"
      );

    case "btcBullishBearException":
      return upper(
        snapshotFirstValue(
          trade,
          ["exceptions.btcBullishBearExceptionLabel"],
          yesNo(snapshotFirstValue(trade, ["exceptions.btcBullishBearException"], false))
        ),
        "NO"
      );

    default:
      return "UNKNOWN";
  }
}

function hasUsablePatternValues(trade: ClosedTrade, pattern: ExclusivePattern): boolean {
  return pattern.keys.every(key => {
    const value = exclusiveFilterValue(trade, key);
    return !isBadExclusiveValueForKey(key, value);
  });
}

function buildExclusiveKey(pattern: ExclusivePattern, trade: ClosedTrade): string {
  return [
    "MODE=EXCLUSIVE",
    `PATTERN=${pattern.name}`,
    ...EXCLUSIVE_FILTER_KEYS.map(key => {
      const label = EXCLUSIVE_LABELS[key];
      const value = pattern.keys.includes(key)
        ? exclusiveFilterValue(trade, key)
        : "ANY";

      return `${label}=${value}`;
    })
  ].join("|");
}

function distributionForKey(trades: ClosedTrade[], key: ExclusiveFilterKey): Record<string, number> {
  const dist: Record<string, number> = {};

  for (const trade of trades) {
    const value = exclusiveFilterValue(trade, key);

    if (isBadExclusiveValueForKey(key, value)) continue;

    dist[value] = Number(dist[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(dist).sort((a, b) => b[1] - a[1])
  );
}

function buildFixedAndMixedFilters(
  trades: ClosedTrade[],
  activeKeys: ExclusiveFilterKey[]
): {
  fixedFilters: Record<string, string | number | boolean | null>;
  mixedFilters: Record<string, Record<string, number>>;
} {
  const fixedFilters: Record<string, string | number | boolean | null> = {};
  const mixedFilters: Record<string, Record<string, number>> = {};

  for (const key of activeKeys) {
    const dist = distributionForKey(trades, key);
    const values = Object.keys(dist);

    if (!values.length) continue;

    if (values.length === 1) {
      fixedFilters[key] = values[0];
      continue;
    }

    mixedFilters[key] = dist;
  }

  return {
    fixedFilters,
    mixedFilters
  };
}

function extractPatternNameFromKey(cohortKey: string): string {
  return keyPart(cohortKey, "PATTERN=", "UNKNOWN");
}

function buildExclusiveRow({
  cohortKey,
  rows,
  filters,
  groupId,
  groupRank
}: {
  cohortKey: string;
  rows: ClosedTrade[];
  filters: DashboardFilters;
  groupId: string;
  groupRank: number;
}): ExclusiveGroupRow {
  const metrics = summarizeTrades(rows);
  const first = rows[0];

  const patternName = extractPatternNameFromKey(cohortKey);
  const pattern = EXCLUSIVE_PATTERNS.find(item => item.name === patternName);
  const activeKeys = pattern?.keys ?? [];

  const { fixedFilters, mixedFilters } = buildFixedAndMixedFilters(
    rows,
    activeKeys
  );

  const symbols = uniqueSorted(
    rows
      .map(symbolOf)
      .filter(symbol => symbol !== "UNKNOWN")
  );

  return {
    groupId,
    groupRank,
    patternName,
    fixedFilters,
    mixedFilters,
    tradeIds: rows.map(row => row.tradeId),

    score: optimizerScore(metrics, filters),
    cohortKey,
    label: cohortKey,

    sample: rows.length,
    count: rows.length,

    ...metrics,

    setupClass: keyPart(cohortKey, "SETUP=", setupClassOf(first)),
    side: keyPart(cohortKey, "SIDE=", sideOf(first)),
    entryReason: keyPart(cohortKey, "ENTRY=", entryReasonOf(first)),
    reason: keyPart(cohortKey, "ENTRY=", entryReasonOf(first)),
    grade: keyPart(cohortKey, "GRADE=", gradeOf(first)),
    regime: keyPart(cohortKey, "REGIME=", regimeOf(first)),
    flow: keyPart(cohortKey, "FLOW=", flowOf(first)),
    btcState: keyPart(cohortKey, "BTC=", btcStateOf(first)),
    rsiZone: keyPart(cohortKey, "RSI=", rsiZoneOf(first)),
    rsiEdge: keyPart(cohortKey, "EDGE=", rsiEdgeOf(first)),
    obBias: keyPart(cohortKey, "OB_BIAS=", obBiasOf(first)),
    obRelation: keyPart(cohortKey, "OB_REL=", obRelationOf(first)),
    spreadBucket: keyPart(cohortKey, "SPREAD=", spreadBucketOf(first)),
    depthBucket: keyPart(cohortKey, "DEPTH=", depthBucketOf(first)),

    symbols
  };
}

function buildExclusiveCandidateRows(
  trades: ClosedTrade[],
  filters: DashboardFilters,
  side: ExclusiveSide,
  minTrades: number,
  allowOversized: boolean
): ExclusiveGroupRow[] {
  const sideTrades = trades.filter(trade => normalizedTradeSideForGroups(trade) === side);

  if (!sideTrades.length) return [];

  const minWilson = percentInputToRatio(filters.minWilson, 0);
  const minWinrate = percentInputToRatio(filters.minWinrate, 0);
  const maxShare = sideTrades.length >= minTrades * 4 ? 0.45 : 1;

  const map = new Map<string, ClosedTrade[]>();

  for (const trade of sideTrades) {
    for (const pattern of EXCLUSIVE_PATTERNS) {
      if (!hasUsablePatternValues(trade, pattern)) continue;

      const key = buildExclusiveKey(pattern, trade);

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)!.push(trade);
    }
  }

  return Array.from(map.entries())
    .map(([cohortKey, rows]) => {
      return buildExclusiveRow({
        cohortKey,
        rows,
        filters,
        groupId: `${side}_CANDIDATE`,
        groupRank: 0
      });
    })
    .filter(row => {
      if (row.trades < minTrades) return false;
      if (minWilson > 0 && row.wilson < minWilson) return false;
      if (minWinrate > 0 && row.winrate < minWinrate) return false;

      if (!allowOversized && row.trades / sideTrades.length > maxShare) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aPositive = a.totalR > 0 && a.avgR > 0 ? 1 : 0;
      const bPositive = b.totalR > 0 && b.avgR > 0 ? 1 : 0;

      if (aPositive !== bPositive) return bPositive - aPositive;

      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      const wilsonDiff = b.wilson - a.wilson;
      if (wilsonDiff !== 0) return wilsonDiff;

      return b.trades - a.trades;
    });
}

function buildOtherExclusiveKey(side: ExclusiveSide): string {
  return [
    "MODE=EXCLUSIVE",
    "PATTERN=OTHER",
    ...EXCLUSIVE_FILTER_KEYS.map(key => {
      const label = EXCLUSIVE_LABELS[key];

      if (key === "side") return `${label}=${side}`;

      return `${label}=ANY`;
    })
  ].join("|");
}

function buildExclusiveGroupsForSide(
  trades: ClosedTrade[],
  filters: DashboardFilters,
  side: ExclusiveSide
): ExclusiveGroupRow[] {
  const minTrades = Math.max(1, num(filters.minTrades, 5));

  const remaining = new Map(
    trades
      .filter(trade => normalizedTradeSideForGroups(trade) === side)
      .map(trade => [trade.tradeId, trade])
  );

  const groups: ExclusiveGroupRow[] = [];

  for (let rank = 1; rank <= EXCLUSIVE_GROUP_LIMIT; rank++) {
    const rows = Array.from(remaining.values());

    if (rows.length < minTrades) break;

    let candidates = buildExclusiveCandidateRows(
      rows,
      filters,
      side,
      minTrades,
      false
    );

    if (!candidates.length) {
      candidates = buildExclusiveCandidateRows(
        rows,
        filters,
        side,
        minTrades,
        true
      );
    }

    const best = candidates[0];

    if (!best) break;

    const selectedTrades = best.tradeIds
      .map(tradeId => remaining.get(tradeId))
      .filter((trade): trade is ClosedTrade => Boolean(trade));

    if (!selectedTrades.length) break;

    const groupId = `${side}_${String(rank).padStart(2, "0")}`;

    groups.push(
      buildExclusiveRow({
        cohortKey: best.cohortKey,
        rows: selectedTrades,
        filters,
        groupId,
        groupRank: rank
      })
    );

    for (const trade of selectedTrades) {
      remaining.delete(trade.tradeId);
    }
  }

  const otherTrades = Array.from(remaining.values());

  if (otherTrades.length > 0) {
    groups.push(
      buildExclusiveRow({
        cohortKey: buildOtherExclusiveKey(side),
        rows: otherTrades,
        filters,
        groupId: `${side}_OTHER`,
        groupRank: 999
      })
    );
  }

  return groups;
}

function eventDimensionValue(event: TradeEvent, dimension: string): string {
  if (dimension === "eventType") return normalizeEventType(event);

  if (dimension === "side") {
    return normalizedSide(
      eventSnapshotFirstValue(
        event,
        ["identity.side"],
        firstValue(event, ["side", "payload.side"])
      )
    );
  }

  if (dimension === "symbol") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["identity.symbol"],
        firstValue(event, ["symbol", "payload.symbol"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "setupClass") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["identity.setupClass"],
        firstValue(event, ["setupClass", "payload.setupClass", "payload.setup.setupClass"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "grade") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["identity.grade"],
        firstValue(event, ["grade", "payload.grade", "payload.setup.grade"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "reason") {
    return upper(firstValue(event, ["reason", "payload.reason"]), "UNKNOWN");
  }

  if (dimension === "flow") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["market.flow"],
        firstValue(event, ["flow", "payload.flow", "payload.market.flow"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "btcState") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["market.btcState"],
        firstValue(event, ["btcState", "payload.btcState", "payload.market.btcState"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "regime") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["market.regime"],
        firstValue(event, ["regime", "payload.regime", "payload.market.regime"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "rsiZone") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["rsi.rsiZone"],
        firstValue(event, ["rsiZone", "payload.rsiZone", "payload.rsi.rsiZone"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "rsiEdge") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["rsi.rsiEdge"],
        firstValue(event, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "obBias") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.obBias"],
        firstValue(event, ["obBias", "payload.obBias", "payload.ob.bias"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "obRelation") {
    const explicit = upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.obRelation"],
        firstValue(event, ["obRelation", "payload.obRelation", "payload.ob.relation"])
      ),
      ""
    );

    if (explicit && !["BULLISH", "BEARISH"].includes(explicit)) return explicit;

    const side = eventDimensionValue(event, "side");
    const obBias = eventDimensionValue(event, "obBias");

    return deriveObRelation(side, obBias, explicit || obBias);
  }

  if (dimension === "spreadBucket") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.spreadBucket"],
        firstValue(event, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"])
      ),
      "UNKNOWN"
    );
  }

  if (dimension === "depthBucket") {
    return upper(
      eventSnapshotFirstValue(
        event,
        ["orderbook.depthBucket"],
        firstValue(event, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"])
      ),
      "UNKNOWN"
    );
  }

  return "UNKNOWN";
}

function tradeDimensionValue(trade: ClosedTrade, dimension: string): string {
  if (dimension === "eventType") return "EXIT";
  if (dimension === "symbol") return symbolOf(trade);
  if (dimension === "side") return sideOf(trade);
  if (dimension === "setupClass") return setupClassOf(trade);
  if (dimension === "grade") return gradeOf(trade);
  if (dimension === "reason") return exitReasonOf(trade);
  if (dimension === "regime") return regimeOf(trade);
  if (dimension === "flow") return flowOf(trade);
  if (dimension === "btcState") return btcStateOf(trade);
  if (dimension === "rsiZone") return rsiZoneOf(trade);
  if (dimension === "rsiEdge") return rsiEdgeOf(trade);
  if (dimension === "obBias") return obBiasOf(trade);
  if (dimension === "obRelation") return obRelationOf(trade);
  if (dimension === "spreadBucket") return spreadBucketOf(trade);
  if (dimension === "depthBucket") return depthBucketOf(trade);
  if (dimension === "outcome") return outcomeOf(trade);

  return "UNKNOWN";
}

function buildBreakdown(events: TradeEvent[], trades: ClosedTrade[]): BreakdownRow[] {
  const dimensions = [
    "eventType",
    "symbol",
    "side",
    "setupClass",
    "reason",
    "grade",
    "regime",
    "flow",
    "btcState",
    "rsiZone",
    "rsiEdge",
    "obBias",
    "obRelation",
    "spreadBucket",
    "depthBucket",
    "outcome"
  ];

  const rows: BreakdownRow[] = [];

  for (const dimension of dimensions) {
    const eventMap = new Map<string, TradeEvent[]>();
    const tradeMap = new Map<string, ClosedTrade[]>();

    for (const event of events) {
      if (dimension === "outcome") continue;

      const value = eventDimensionValue(event, dimension) || "UNKNOWN";

      if (!eventMap.has(value)) {
        eventMap.set(value, []);
      }

      eventMap.get(value)!.push(event);
    }

    for (const trade of trades) {
      const value = tradeDimensionValue(trade, dimension) || "UNKNOWN";

      if (!tradeMap.has(value)) {
        tradeMap.set(value, []);
      }

      tradeMap.get(value)!.push(trade);
    }

    const values = new Set([
      ...eventMap.keys(),
      ...tradeMap.keys()
    ]);

    for (const value of values) {
      const eventGroup = eventMap.get(value) || [];
      const tradeGroup = tradeMap.get(value) || [];
      const metrics = summarizeTrades(tradeGroup);

      const eventTypes = eventGroup.map(normalizeEventType);

      rows.push({
        dimension,
        value,

        count: eventGroup.length || tradeGroup.length,
        events: eventGroup.length,
        trades: metrics.trades,
        closed: metrics.closed,

        entries: eventTypes.filter(type => type === "ENTRY").length,
        exits: eventTypes.filter(type => type === "EXIT").length,
        rejects: eventTypes.filter(type => type === "REJECT").length,
        snapshots: eventTypes.filter(type => type === "SNAPSHOT").length,
        holds: eventTypes.filter(type => type === "HOLD").length,

        wins: metrics.wins,
        losses: metrics.losses,
        flats: metrics.flats,

        winrate: metrics.winrate,
        wilson: metrics.wilson,

        totalR: metrics.totalR,
        avgR: metrics.avgR,
        pnlPct: metrics.pnlPct,
        avgPnlPct: metrics.avgPnlPct,
        profitFactor: metrics.profitFactor,

        directSlPct: metrics.directSlPct,
        nearTpPct: metrics.nearTpPct,

        examples: eventGroup
          .slice(-8)
          .map(event => {
            const symbol = eventDimensionValue(event, "symbol");
            const side = eventDimensionValue(event, "side");
            const type = normalizeEventType(event);

            return `${symbol}_${side}_${type}`;
          })
          .join(", ")
      });
    }
  }

  return rows
    .filter(row => row.events > 0 || row.trades > 0)
    .sort((a, b) => {
      const eventDiff = b.events - a.events;
      if (eventDiff !== 0) return eventDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.trades - a.trades;
    })
    .slice(0, 250);
}

function buildRecentTrades(events: TradeEvent[]): RecentTradeRow[] {
  return [...events]
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, 150)
    .map(event => {
      const ts = eventTime(event);

      return {
        id: text(event.eventId),
        eventId: text(event.eventId),
        tradeId: nullableText(firstValue(event, ["tradeId", "payload.tradeId"])),

        ts,
        receivedAt: nullableNum(firstValue(event, ["receivedAt"])),
        date: new Date(ts || Date.now()).toISOString(),

        eventType: normalizeEventType(event),
        action: text(firstValue(event, ["action", "payload.action"])),
        reason: text(firstValue(event, ["reason", "payload.reason"])),

        symbol: nullableText(
          eventSnapshotFirstValue(
            event,
            ["identity.symbol"],
            firstValue(event, ["symbol", "payload.symbol"])
          )
        ),

        side: nullableText(
          eventSnapshotFirstValue(
            event,
            ["identity.side"],
            firstValue(event, ["side", "payload.side"])
          )
        ),

        setupClass: nullableText(
          eventSnapshotFirstValue(
            event,
            ["identity.setupClass"],
            firstValue(event, ["setupClass", "payload.setupClass"])
          )
        ),

        grade: nullableText(
          eventSnapshotFirstValue(
            event,
            ["identity.grade"],
            firstValue(event, ["grade", "payload.grade"])
          )
        ),

        entry: nullableNum(firstValue(event, ["entry", "price", "payload.entry", "payload.price", "filterSnapshot.riskGeometry.entry", "payload.filterSnapshot.riskGeometry.entry"])),
        sl: nullableNum(firstValue(event, ["sl", "payload.sl", "filterSnapshot.riskGeometry.sl", "payload.filterSnapshot.riskGeometry.sl"])),
        initialSl: nullableNum(firstValue(event, ["initialSl", "payload.initialSl"])),
        tp: nullableNum(firstValue(event, ["tp", "payload.tp", "filterSnapshot.riskGeometry.tp", "payload.filterSnapshot.riskGeometry.tp"])),
        exit: nullableNum(firstValue(event, ["exit", "executionPrice", "payload.exit", "payload.executionPrice"])),

        rr: nullableNum(firstValue(event, ["rr", "payload.rr"])),
        plannedRR: nullableNum(firstValue(event, ["plannedRR", "payload.plannedRR", "filterSnapshot.rr.plannedRR", "payload.filterSnapshot.rr.plannedRR"])),
        baseRR: nullableNum(firstValue(event, ["baseRR", "payload.baseRR", "filterSnapshot.rr.baseRR", "payload.filterSnapshot.rr.baseRR"])),
        finalRr: nullableNum(firstValue(event, ["finalRr", "finalRR", "payload.finalRr", "payload.finalRR", "filterSnapshot.rr.finalRr", "payload.filterSnapshot.rr.finalRr"])),
        exitR: nullableNum(firstValue(event, ["exitR", "payload.exitR"])),
        pnlPct: nullableNum(firstValue(event, ["pnlPct", "payload.pnlPct"])),

        score: nullableNum(firstValue(event, ["score", "payload.score", "filterSnapshot.scanner.score", "payload.filterSnapshot.scanner.score"])),
        confluence: nullableNum(firstValue(event, ["confluence", "payload.confluence", "filterSnapshot.confluence.effectiveConfluence", "payload.filterSnapshot.confluence.effectiveConfluence"])),
        sniperScore: nullableNum(firstValue(event, ["sniperScore", "payload.sniperScore", "filterSnapshot.sniper.sniperScore", "payload.filterSnapshot.sniper.sniperScore"])),

        rsi: nullableNum(firstValue(event, ["rsi", "payload.rsi", "filterSnapshot.rsi.rsi", "payload.filterSnapshot.rsi.rsi"])),
        rsiHTF: nullableNum(firstValue(event, ["rsiHTF", "payload.rsiHTF", "filterSnapshot.rsi.rsiHTF", "payload.filterSnapshot.rsi.rsiHTF"])),

        rsiZone: nullableText(
          eventSnapshotFirstValue(
            event,
            ["rsi.rsiZone"],
            firstValue(event, ["rsiZone", "payload.rsiZone"])
          )
        ),

        rsiEdge: nullableText(
          eventSnapshotFirstValue(
            event,
            ["rsi.rsiEdge"],
            firstValue(event, ["rsiEdge", "payload.rsiEdge"])
          )
        ),

        obBias: nullableText(
          eventSnapshotFirstValue(
            event,
            ["orderbook.obBias"],
            firstValue(event, ["obBias", "payload.obBias"])
          )
        ),

        obRelation: nullableText(
          eventSnapshotFirstValue(
            event,
            ["orderbook.obRelation"],
            firstValue(event, ["obRelation", "payload.obRelation"])
          )
        ),

        spreadPct: nullableNum(firstValue(event, ["spreadPct", "payload.spreadPct", "filterSnapshot.orderbook.spreadPct", "payload.filterSnapshot.orderbook.spreadPct"])),
        spreadBps: nullableNum(firstValue(event, ["spreadBps", "payload.spreadBps", "filterSnapshot.orderbook.spreadBps", "payload.filterSnapshot.orderbook.spreadBps"])),

        spreadBucket: nullableText(
          eventSnapshotFirstValue(
            event,
            ["orderbook.spreadBucket"],
            firstValue(event, ["spreadBucket", "payload.spreadBucket"])
          )
        ),

        depthMinUsd1p: nullableNum(firstValue(event, ["depthMinUsd1p", "payload.depthMinUsd1p", "filterSnapshot.orderbook.depthMinUsd1p", "payload.filterSnapshot.orderbook.depthMinUsd1p"])),

        depthBucket: nullableText(
          eventSnapshotFirstValue(
            event,
            ["orderbook.depthBucket"],
            firstValue(event, ["depthBucket", "payload.depthBucket"])
          )
        ),

        flow: nullableText(
          eventSnapshotFirstValue(
            event,
            ["market.flow"],
            firstValue(event, ["flow", "payload.flow"])
          )
        ),

        btcState: nullableText(
          eventSnapshotFirstValue(
            event,
            ["market.btcState"],
            firstValue(event, ["btcState", "payload.btcState"])
          )
        ),

        regime: nullableText(
          eventSnapshotFirstValue(
            event,
            ["market.regime"],
            firstValue(event, ["regime", "payload.regime"])
          )
        ),

        mfeR: nullableNum(firstValue(event, ["mfeR", "payload.mfeR"])),
        maeR: nullableNum(firstValue(event, ["maeR", "payload.maeR"])),
        currentR: nullableNum(firstValue(event, ["currentR", "payload.currentR"])),

        directToSL: bool(firstValue(event, ["directToSL", "payload.directToSL"])),
        nearTpSeen: bool(firstValue(event, ["nearTpSeen", "payload.nearTpSeen"])),
        reachedHalfR: bool(firstValue(event, ["reachedHalfR", "payload.reachedHalfR"])),
        reachedOneR: bool(firstValue(event, ["reachedOneR", "payload.reachedOneR"])),
        breakEvenActivated: bool(firstValue(event, ["breakEvenActivated", "payload.breakEvenActivated"])),
        breakEvenStop: bool(firstValue(event, ["breakEvenStop", "payload.breakEvenStop"])),

        strategyVersion: nullableText(
          eventSnapshotFirstValue(
            event,
            ["strategyVersion"],
            firstValue(event, ["strategyVersion", "payload.strategyVersion"])
          )
        ),

        runId: nullableText(firstValue(event, ["runId", "payload.runId"]))
      };
    });
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const allEvents = await listTradeEvents();

  const filteredRawEvents = allEvents.filter(event =>
    rawEventPassesFilters(event, filters)
  );

  const allClosedTrades = buildClosedTrades(allEvents);

  const filteredClosedTrades = allClosedTrades.filter(trade =>
    tradePassesFilters(trade, filters)
  );

  return {
    overview: buildOverview(filteredRawEvents, filteredClosedTrades, filters),
    options: buildOptions(allEvents),
    cohorts: buildCohorts(filteredClosedTrades, filters),

    exclusiveGroupsLong: buildExclusiveGroupsForSide(
      filteredClosedTrades,
      filters,
      "LONG"
    ),

    exclusiveGroupsShort: buildExclusiveGroupsForSide(
      filteredClosedTrades,
      filters,
      "SHORT"
    ),

    breakdown: buildBreakdown(filteredRawEvents, filteredClosedTrades),
    recentTrades: buildRecentTrades(filteredRawEvents),
    rawEvents: filteredRawEvents
  };
}

export {
  buildClosedTrades,
  summarizeTrades,
  wilsonLowerBound
};