import type { TradeEvent } from "./store";

type AnyRecord = Record<string, unknown>;
type AnyTradeEvent = TradeEvent & AnyRecord;

export type MetricSummary = {
  trades: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  totalPnlPct: number;
  avgPnlPct: number;
  profitFactor: number;
  bestR: number | null;
  worstR: number | null;
};

export type CohortRow = MetricSummary & {
  cohortKey: string;
  symbols: string[];
};

export type GroupRow = MetricSummary & {
  key: string;
  symbols: string[];
};

export type AnalyticsResult = {
  generatedAt: string;
  totalEvents: number;

  counts: {
    entries: number;
    exits: number;
    rejects: number;
    snapshots: number;
    unknown: number;
  };

  overview: MetricSummary;
  summary: MetricSummary;

  cohorts: CohortRow[];

  bySymbol: GroupRow[];
  bySetupClass: GroupRow[];
  byEntryReason: GroupRow[];
  byExitReason: GroupRow[];
  bySide: GroupRow[];
  byRsiZone: GroupRow[];
  byRsiEdge: GroupRow[];
  byBtcState: GroupRow[];
  byRegime: GroupRow[];
  byFlow: GroupRow[];
  byObBias: GroupRow[];
  byObRelation: GroupRow[];
  bySpreadBucket: GroupRow[];
  byDepthBucket: GroupRow[];

  winners: AnyTradeEvent[];
  losers: AnyTradeEvent[];
  entries: AnyTradeEvent[];
  exits: AnyTradeEvent[];
  rejects: AnyTradeEvent[];
  recent: AnyTradeEvent[];
};

type ClosedTrade = {
  event: AnyTradeEvent;
  entry?: AnyTradeEvent;
};

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function getValue(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function getTradeValue(trade: ClosedTrade, paths: string[], fallback: unknown = null): unknown {
  const fromExit = getValue(trade.event, paths, undefined);

  if (fromExit !== undefined && fromExit !== null && fromExit !== "") {
    return fromExit;
  }

  const fromEntry = getValue(trade.entry, paths, undefined);

  if (fromEntry !== undefined && fromEntry !== null && fromEntry !== "") {
    return fromEntry;
  }

  return fallback;
}

function toText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function toUpperText(value: unknown, fallback = "UNKNOWN"): string {
  const text = toText(value, fallback);
  return text.toUpperCase();
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeDivide(a: number, b: number): number {
  if (!b) return 0;
  return a / b;
}

function normalizeEventType(event: AnyTradeEvent): string {
  const raw = toUpperText(
    getValue(event, [
      "eventType",
      "type",
      "action",
      "payload.eventType",
      "payload.type",
      "payload.action",
      "reason",
      "payload.reason"
    ]),
    "UNKNOWN"
  );

  if (raw.includes("ENTRY")) return "ENTRY";
  if (raw.includes("EXIT")) return "EXIT";
  if (raw.includes("REJECT")) return "REJECT";
  if (raw.includes("WAIT")) return "REJECT";
  if (raw.includes("SKIP")) return "REJECT";
  if (raw.includes("SNAPSHOT")) return "SNAPSHOT";

  const reason = toUpperText(getValue(event, ["reason", "exitReason", "payload.reason"]), "");

  if (reason.includes("TP") || reason.includes("SL") || reason.includes("STOP")) {
    return "EXIT";
  }

  return raw;
}

function isEntryEvent(event: AnyTradeEvent): boolean {
  return normalizeEventType(event) === "ENTRY";
}

function isExitEvent(event: AnyTradeEvent): boolean {
  return normalizeEventType(event) === "EXIT";
}

function isRejectEvent(event: AnyTradeEvent): boolean {
  return normalizeEventType(event) === "REJECT";
}

function isSnapshotEvent(event: AnyTradeEvent): boolean {
  return normalizeEventType(event) === "SNAPSHOT";
}

function getTradeId(event: AnyTradeEvent): string | null {
  const value = getValue(event, [
    "tradeId",
    "id",
    "signalId",
    "entry.tradeId",
    "exit.tradeId",
    "payload.tradeId",
    "payload.id",
    "payload.signalId"
  ]);

  const text = toText(value, "");
  return text || null;
}

function buildEntryIndex(events: AnyTradeEvent[]): Map<string, AnyTradeEvent> {
  const map = new Map<string, AnyTradeEvent>();

  for (const event of events) {
    if (!isEntryEvent(event)) continue;

    const tradeId = getTradeId(event);
    if (!tradeId) continue;

    map.set(tradeId, event);
  }

  return map;
}

function buildClosedTrades(events: AnyTradeEvent[]): ClosedTrade[] {
  const entryIndex = buildEntryIndex(events);

  return events
    .filter(isExitEvent)
    .map(event => {
      const tradeId = getTradeId(event);
      const entry = tradeId ? entryIndex.get(tradeId) : undefined;

      return {
        event,
        entry
      };
    });
}

function tradeSymbol(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "symbol",
      "entry.symbol",
      "exit.symbol",
      "payload.symbol"
    ]),
    "UNKNOWN"
  );
}

function tradeSide(trade: ClosedTrade): string {
  const raw = toUpperText(
    getTradeValue(trade, [
      "side",
      "entry.side",
      "exit.side",
      "payload.side"
    ]),
    "UNKNOWN"
  );

  if (["BULL", "LONG", "BUY", "BULLISH"].includes(raw)) return "LONG";
  if (["BEAR", "SHORT", "SELL", "BEARISH"].includes(raw)) return "SHORT";

  return raw;
}

function tradeSetupClass(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "setupClass",
      "entry.setupClass",
      "payload.setupClass",
      "liveGrade",
      "grade"
    ]),
    "UNKNOWN"
  );
}

function tradeEntryReason(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "entryReason",
      "reason",
      "entry.entryReason",
      "payload.entryReason",
      "payload.reason"
    ]),
    "UNKNOWN"
  );
}

function tradeExitReason(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "exitReason",
      "reason",
      "exit.exitReason",
      "payload.exitReason",
      "payload.reason"
    ]),
    "UNKNOWN"
  );
}

function tradeRsiZone(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "rsiZone",
      "entry.rsiZone",
      "payload.rsiZone",
      "rsi.rsiZone"
    ]),
    "UNKNOWN"
  );
}

function tradeRsiEdge(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "rsiEdge",
      "entry.rsiEdge",
      "payload.rsiEdge",
      "rsi.rsiEdge"
    ]),
    "UNKNOWN"
  );
}

function tradeBtcState(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "btcState",
      "entry.btcState",
      "payload.btcState",
      "market.btcState"
    ]),
    "UNKNOWN"
  );
}

function tradeRegime(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "regime",
      "entry.regime",
      "payload.regime",
      "market.regime"
    ]),
    "UNKNOWN"
  );
}

function tradeFlow(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "flow",
      "entry.flow",
      "payload.flow",
      "market.flow"
    ]),
    "UNKNOWN"
  );
}

function tradeObBias(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "obBias",
      "entry.obBias",
      "payload.obBias",
      "ob.bias",
      "orderbook.bias"
    ]),
    "UNKNOWN"
  );
}

function tradeObRelation(trade: ClosedTrade): string {
  return toUpperText(
    getTradeValue(trade, [
      "obRelation",
      "entry.obRelation",
      "payload.obRelation",
      "ob.relation",
      "orderbook.relation"
    ]),
    "UNKNOWN"
  );
}

function tradeSpreadBucket(trade: ClosedTrade): string {
  const explicit = toUpperText(
    getTradeValue(trade, [
      "spreadBucket",
      "entry.spreadBucket",
      "payload.spreadBucket",
      "ob.spreadBucket"
    ]),
    ""
  );

  if (explicit) return explicit;

  const spreadBps = toNumber(
    getTradeValue(trade, [
      "spreadBps",
      "entry.spreadBps",
      "payload.spreadBps",
      "ob.spreadBps"
    ])
  );

  const spreadPct = toNumber(
    getTradeValue(trade, [
      "spreadPct",
      "entry.spreadPct",
      "payload.spreadPct",
      "ob.spreadPct"
    ])
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

function tradeDepthBucket(trade: ClosedTrade): string {
  const explicit = toUpperText(
    getTradeValue(trade, [
      "depthBucket",
      "entry.depthBucket",
      "payload.depthBucket",
      "ob.depthBucket"
    ]),
    ""
  );

  if (explicit) return explicit;

  const depth = toNumber(
    getTradeValue(trade, [
      "depthUsd1p",
      "depthMinUsd1p",
      "entry.depthUsd1p",
      "entry.depthMinUsd1p",
      "payload.depthUsd1p",
      "payload.depthMinUsd1p",
      "ob.depthMinUsd1p"
    ])
  );

  if (depth === null) return "DEPTH_NA";
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function getExitRFromTrade(trade: ClosedTrade): number | null {
  return toNumber(
    getTradeValue(trade, [
      "exitR",
      "exit.exitR",
      "payload.exitR",
      "outcome.exitR"
    ])
  );
}

function getPnlPctFromTrade(trade: ClosedTrade): number | null {
  return toNumber(
    getTradeValue(trade, [
      "pnlPct",
      "pnl",
      "exit.pnlPct",
      "payload.pnlPct",
      "payload.pnl",
      "outcome.pnlPct"
    ])
  );
}

function isWinTrade(trade: ClosedTrade): boolean {
  const exitR = getExitRFromTrade(trade);
  if (exitR !== null) return exitR > 0;

  const pnlPct = getPnlPctFromTrade(trade);
  return pnlPct !== null && pnlPct > 0;
}

function isLossTrade(trade: ClosedTrade): boolean {
  const exitR = getExitRFromTrade(trade);
  if (exitR !== null) return exitR < 0;

  const pnlPct = getPnlPctFromTrade(trade);
  return pnlPct !== null && pnlPct < 0;
}

function wilsonLowerBound(wins: number, total: number, z = 1.96): number {
  if (!total) return 0;

  const p = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;

  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return (centre - margin) / denominator;
}

function profitFactor(values: number[]): number {
  const grossWin = values
    .filter(value => value > 0)
    .reduce((sum, value) => sum + value, 0);

  const grossLoss = Math.abs(
    values
      .filter(value => value < 0)
      .reduce((sum, value) => sum + value, 0)
  );

  if (!grossLoss) {
    return grossWin > 0 ? 999 : 0;
  }

  return grossWin / grossLoss;
}

function buildMetricSummary(trades: ClosedTrade[]): MetricSummary {
  const wins = trades.filter(isWinTrade).length;
  const losses = trades.filter(isLossTrade).length;
  const flats = Math.max(0, trades.length - wins - losses);

  const exitRValues = trades
    .map(getExitRFromTrade)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const pnlPctValues = trades
    .map(getPnlPctFromTrade)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const totalR = exitRValues.reduce((sum, value) => sum + value, 0);
  const totalPnlPct = pnlPctValues.reduce((sum, value) => sum + value, 0);

  return {
    trades: trades.length,
    wins,
    losses,
    flats,

    winRate: round(safeDivide(wins, wins + losses) * 100, 2),
    wilson: round(wilsonLowerBound(wins, wins + losses) * 100, 2),

    totalR: round(totalR, 3),
    avgR: round(safeDivide(totalR, exitRValues.length), 3),

    totalPnlPct: round(totalPnlPct, 3),
    avgPnlPct: round(safeDivide(totalPnlPct, pnlPctValues.length), 3),

    profitFactor: round(profitFactor(exitRValues), 3),

    bestR: exitRValues.length ? round(Math.max(...exitRValues), 3) : null,
    worstR: exitRValues.length ? round(Math.min(...exitRValues), 3) : null
  };
}

function scoreBucket(value: unknown, label: string): string {
  const n = toNumber(value);

  if (n === null) return `${label}_NA`;
  if (n >= 95) return `${label}_95_100`;
  if (n >= 90) return `${label}_90_95`;
  if (n >= 85) return `${label}_85_90`;
  if (n >= 80) return `${label}_80_85`;
  if (n >= 70) return `${label}_70_80`;
  if (n >= 60) return `${label}_60_70`;

  return `${label}_LT_60`;
}

function rrBucket(value: unknown): string {
  const n = toNumber(value);

  if (n === null) return "RR_NA";
  if (n >= 2) return "RR_GTE_2";
  if (n >= 1.75) return "RR_1P75_2P00";
  if (n >= 1.5) return "RR_1P50_1P75";
  if (n >= 1.25) return "RR_1P25_1P50";
  if (n >= 1) return "RR_1P00_1P25";

  return "RR_LT_1";
}

function buildFallbackCohortKey(trade: ClosedTrade): string {
  const confluence = getTradeValue(trade, [
    "confluence",
    "entry.confluence",
    "payload.confluence"
  ]);

  const sniperScore = getTradeValue(trade, [
    "sniperScore",
    "entry.sniperScore",
    "payload.sniperScore"
  ]);

  const finalRR = getTradeValue(trade, [
    "finalRr",
    "finalRR",
    "plannedRR",
    "entry.finalRR",
    "entry.finalRr",
    "payload.finalRr",
    "payload.plannedRR"
  ]);

  return [
    `SETUP=${tradeSetupClass(trade)}`,
    `SIDE=${tradeSide(trade)}`,
    `REASON=${tradeEntryReason(trade)}`,
    `RSI=${tradeRsiZone(trade)}`,
    `EDGE=${tradeRsiEdge(trade)}`,
    `FLOW=${tradeFlow(trade)}`,
    `BTC=${tradeBtcState(trade)}`,
    `OB=${tradeObRelation(trade)}`,
    scoreBucket(confluence, "CONF"),
    scoreBucket(sniperScore, "SNIPER"),
    rrBucket(finalRR),
    tradeSpreadBucket(trade),
    tradeDepthBucket(trade)
  ].join("|");
}

function tradeCohortKey(trade: ClosedTrade): string {
  const explicit = toText(
    getTradeValue(trade, [
      "cohortKey",
      "entry.cohortKey",
      "payload.cohortKey",
      "analytics.cohortKey"
    ]),
    ""
  );

  return explicit || buildFallbackCohortKey(trade);
}

function buildCohortRows(trades: ClosedTrade[]): CohortRow[] {
  const map = new Map<string, ClosedTrade[]>();

  for (const trade of trades) {
    const cohortKey = tradeCohortKey(trade);

    if (!map.has(cohortKey)) {
      map.set(cohortKey, []);
    }

    map.get(cohortKey)?.push(trade);
  }

  return [...map.entries()]
    .map(([cohortKey, cohortTrades]) => {
      const metrics = buildMetricSummary(cohortTrades);

      const symbols = Array.from(
        new Set(
          cohortTrades
            .map(tradeSymbol)
            .filter(isNonEmptyString)
            .filter(symbol => symbol !== "UNKNOWN")
        )
      );

      return {
        cohortKey,
        ...metrics,
        symbols
      };
    })
    .sort((a, b) => {
      const wilsonDiff = b.wilson - a.wilson;
      if (wilsonDiff !== 0) return wilsonDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.trades - a.trades;
    });
}

function buildGroupRows(
  trades: ClosedTrade[],
  keyGetter: (trade: ClosedTrade) => string,
  limit = 100
): GroupRow[] {
  const map = new Map<string, ClosedTrade[]>();

  for (const trade of trades) {
    const key = keyGetter(trade) || "UNKNOWN";

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)?.push(trade);
  }

  return [...map.entries()]
    .map(([key, groupTrades]) => {
      const metrics = buildMetricSummary(groupTrades);

      const symbols = Array.from(
        new Set(
          groupTrades
            .map(tradeSymbol)
            .filter(isNonEmptyString)
            .filter(symbol => symbol !== "UNKNOWN")
        )
      );

      return {
        key,
        ...metrics,
        symbols
      };
    })
    .sort((a, b) => {
      const tradesDiff = b.trades - a.trades;
      if (tradesDiff !== 0) return tradesDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.wilson - a.wilson;
    })
    .slice(0, limit);
}

function getEventTime(event: AnyTradeEvent): number {
  const value = getValue(event, [
    "receivedAt",
    "createdAt",
    "updatedAt",
    "timestamp",
    "ts",
    "time",
    "payload.receivedAt",
    "payload.createdAt",
    "payload.timestamp",
    "payload.ts"
  ]);

  const n = toNumber(value);
  if (n !== null && n > 1_000_000_000_000) return n;
  if (n !== null && n > 1_000_000_000) return n * 1000;

  const parsed = Date.parse(toText(value, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortRecent(events: AnyTradeEvent[]): AnyTradeEvent[] {
  return [...events]
    .sort((a, b) => getEventTime(b) - getEventTime(a))
    .slice(0, 250);
}

export function buildAnalytics(eventsInput: TradeEvent[] = []): AnalyticsResult {
  const events = Array.isArray(eventsInput)
    ? eventsInput.map(event => event as AnyTradeEvent)
    : [];

  const entries = events.filter(isEntryEvent);
  const exits = events.filter(isExitEvent);
  const rejects = events.filter(isRejectEvent);
  const snapshots = events.filter(isSnapshotEvent);

  const knownCount = entries.length + exits.length + rejects.length + snapshots.length;
  const unknown = Math.max(0, events.length - knownCount);

  const closedTrades = buildClosedTrades(events);
  const overview = buildMetricSummary(closedTrades);

  const winners = closedTrades
    .filter(isWinTrade)
    .map(trade => trade.event);

  const losers = closedTrades
    .filter(isLossTrade)
    .map(trade => trade.event);

  return {
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,

    counts: {
      entries: entries.length,
      exits: exits.length,
      rejects: rejects.length,
      snapshots: snapshots.length,
      unknown
    },

    overview,
    summary: overview,

    cohorts: buildCohortRows(closedTrades),

    bySymbol: buildGroupRows(closedTrades, tradeSymbol),
    bySetupClass: buildGroupRows(closedTrades, tradeSetupClass),
    byEntryReason: buildGroupRows(closedTrades, tradeEntryReason),
    byExitReason: buildGroupRows(closedTrades, tradeExitReason),
    bySide: buildGroupRows(closedTrades, tradeSide),
    byRsiZone: buildGroupRows(closedTrades, tradeRsiZone),
    byRsiEdge: buildGroupRows(closedTrades, tradeRsiEdge),
    byBtcState: buildGroupRows(closedTrades, tradeBtcState),
    byRegime: buildGroupRows(closedTrades, tradeRegime),
    byFlow: buildGroupRows(closedTrades, tradeFlow),
    byObBias: buildGroupRows(closedTrades, tradeObBias),
    byObRelation: buildGroupRows(closedTrades, tradeObRelation),
    bySpreadBucket: buildGroupRows(closedTrades, tradeSpreadBucket),
    byDepthBucket: buildGroupRows(closedTrades, tradeDepthBucket),

    winners,
    losers,
    entries,
    exits,
    rejects,
    recent: sortRecent(events)
  };
}

export {
  wilsonLowerBound,
  buildMetricSummary
};