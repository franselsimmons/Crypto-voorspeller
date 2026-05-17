import type { TradeEvent } from "./store";

export type CohortRow = {
  cohortKey: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  totalPnlPct: number;
  avgPnlPct: number;
  profitFactor: number;
  symbols: string[];
};

export type SymbolRow = {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  totalPnlPct: number;
  avgPnlPct: number;
  profitFactor: number;
};

export type AnalyticsResult = {
  totalEvents: number;
  entries: number;
  exits: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  totalPnlPct: number;
  avgPnlPct: number;
  profitFactor: number;
  bestR: number | null;
  worstR: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  cohorts: CohortRow[];
  symbols: SymbolRow[];
};

function toNumber(value: unknown): number | null {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  return n;
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isClosedTrade(event: TradeEvent): boolean {
  return event.eventType === "EXIT";
}

function getR(event: TradeEvent): number | null {
  return toNumber(event.exitR);
}

function getPnlPct(event: TradeEvent): number | null {
  return toNumber(event.pnlPct);
}

function isWin(event: TradeEvent): boolean {
  const r = getR(event);

  if (r !== null) {
    return r > 0;
  }

  const pnl = getPnlPct(event);

  if (pnl !== null) {
    return pnl > 0;
  }

  const reason = String(event.reason || "").toUpperCase();

  return reason.includes("TP") || reason.includes("TAKE_PROFIT");
}

function isLoss(event: TradeEvent): boolean {
  const r = getR(event);

  if (r !== null) {
    return r < 0;
  }

  const pnl = getPnlPct(event);

  if (pnl !== null) {
    return pnl < 0;
  }

  const reason = String(event.reason || "").toUpperCase();

  return reason.includes("SL") || reason.includes("STOP_LOSS");
}

export function wilsonLowerBound(wins: number, total: number, z = 1.96): number {
  if (total <= 0) {
    return 0;
  }

  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;

  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  return (centre - margin) / denom;
}

function calculateProfitFactor(events: TradeEvent[]): number {
  let grossWin = 0;
  let grossLoss = 0;

  for (const event of events) {
    const r = getR(event);

    if (r === null) {
      continue;
    }

    if (r > 0) {
      grossWin += r;
      continue;
    }

    if (r < 0) {
      grossLoss += Math.abs(r);
    }
  }

  if (grossLoss === 0 && grossWin > 0) {
    return 999;
  }

  if (grossLoss === 0) {
    return 0;
  }

  return grossWin / grossLoss;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCohorts(events: TradeEvent[]): CohortRow[] {
  const map = new Map<string, TradeEvent[]>();

  for (const event of events) {
    const key = event.cohortKey || "UNKNOWN";

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(event);
  }

  return [...map.entries()]
    .map(([cohortKey, cohortEvents]) => {
      const trades = cohortEvents.length;
      const wins = cohortEvents.filter(isWin).length;
      const losses = cohortEvents.filter(isLoss).length;

      const rValues = cohortEvents
        .map(getR)
        .filter((value): value is number => value !== null);

      const pnlValues = cohortEvents
        .map(getPnlPct)
        .filter((value): value is number => value !== null);

      const symbols = [...new Set(cohortEvents.map((event) => event.symbol))].sort();

      const totalR = rValues.reduce((sum, value) => sum + value, 0);
      const totalPnlPct = pnlValues.reduce((sum, value) => sum + value, 0);

      return {
        cohortKey,
        trades,
        wins,
        losses,
        winRate: round(trades ? wins / trades : 0, 4),
        wilson: round(wilsonLowerBound(wins, trades), 4),
        totalR: round(totalR),
        avgR: round(trades ? totalR / trades : 0),
        totalPnlPct: round(totalPnlPct),
        avgPnlPct: round(trades ? totalPnlPct / trades : 0),
        profitFactor: round(calculateProfitFactor(cohortEvents)),
        symbols
      };
    })
    .sort((a, b) => {
      if (b.wilson !== a.wilson) {
        return b.wilson - a.wilson;
      }

      return b.totalR - a.totalR;
    });
}

function buildSymbols(events: TradeEvent[]): SymbolRow[] {
  const map = new Map<string, TradeEvent[]>();

  for (const event of events) {
    const key = event.symbol || "UNKNOWN";

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(event);
  }

  return [...map.entries()]
    .map(([symbol, symbolEvents]) => {
      const trades = symbolEvents.length;
      const wins = symbolEvents.filter(isWin).length;
      const losses = symbolEvents.filter(isLoss).length;

      const rValues = symbolEvents
        .map(getR)
        .filter((value): value is number => value !== null);

      const pnlValues = symbolEvents
        .map(getPnlPct)
        .filter((value): value is number => value !== null);

      const totalR = rValues.reduce((sum, value) => sum + value, 0);
      const totalPnlPct = pnlValues.reduce((sum, value) => sum + value, 0);

      return {
        symbol,
        trades,
        wins,
        losses,
        winRate: round(trades ? wins / trades : 0, 4),
        wilson: round(wilsonLowerBound(wins, trades), 4),
        totalR: round(totalR),
        avgR: round(trades ? totalR / trades : 0),
        totalPnlPct: round(totalPnlPct),
        avgPnlPct: round(trades ? totalPnlPct / trades : 0),
        profitFactor: round(calculateProfitFactor(symbolEvents))
      };
    })
    .sort((a, b) => {
      if (b.wilson !== a.wilson) {
        return b.wilson - a.wilson;
      }

      return b.totalR - a.totalR;
    });
}

export function buildAnalytics(events: TradeEvent[]): AnalyticsResult {
  const exits = events.filter(isClosedTrade);

  const wins = exits.filter(isWin).length;
  const losses = exits.filter(isLoss).length;

  const rValues = exits
    .map(getR)
    .filter((value): value is number => value !== null);

  const pnlValues = exits
    .map(getPnlPct)
    .filter((value): value is number => value !== null);

  const mfeValues = exits
    .map((event) => toNumber(event.mfer))
    .filter((value): value is number => value !== null);

  const maeValues = exits
    .map((event) => toNumber(event.maer))
    .filter((value): value is number => value !== null);

  const totalR = rValues.reduce((sum, value) => sum + value, 0);
  const totalPnlPct = pnlValues.reduce((sum, value) => sum + value, 0);

  const bestR = rValues.length ? Math.max(...rValues) : null;
  const worstR = rValues.length ? Math.min(...rValues) : null;

  return {
    totalEvents: events.length,
    entries: events.filter((event) => event.eventType === "ENTRY").length,
    exits: exits.length,
    closedTrades: exits.length,
    wins,
    losses,
    winRate: round(exits.length ? wins / exits.length : 0, 4),
    wilson: round(wilsonLowerBound(wins, exits.length), 4),
    totalR: round(totalR),
    avgR: round(exits.length ? totalR / exits.length : 0),
    totalPnlPct: round(totalPnlPct),
    avgPnlPct: round(exits.length ? totalPnlPct / exits.length : 0),
    profitFactor: round(calculateProfitFactor(exits)),
    bestR: bestR === null ? null : round(bestR),
    worstR: worstR === null ? null : round(worstR),
    avgMfeR: average(mfeValues) === null ? null : round(average(mfeValues)!),
    avgMaeR: average(maeValues) === null ? null : round(average(maeValues)!),
    cohorts: buildCohorts(exits),
    symbols: buildSymbols(exits)
  };
}