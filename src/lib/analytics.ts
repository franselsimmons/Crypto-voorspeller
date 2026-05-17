type TradeEvent = {
  eventId: string;
  eventType: "ENTRY" | "EXIT";
  symbol: string;
  side: "LONG" | "SHORT";
  cohortKey: string;
  createdAt: string;
  pnlPct: number | null;
  exitR: number | null;
  reason: string | null;
  grade: string | null;
  setupClass: string | null;
};

function round(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return 0;

  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

function wilsonLower(wins: number, total: number, z = 1.96) {
  if (!total) return 0;

  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  return (centre - margin) / denom;
}

function getOutcome(event: TradeEvent) {
  const reason = String(event.reason || "").toUpperCase();

  if (reason.includes("TP")) return "TP";
  if (reason.includes("SL")) return "SL";
  if (reason.includes("BE")) return "BE";

  if (typeof event.exitR === "number") {
    if (event.exitR > 0) return "WIN";
    if (event.exitR < 0) return "LOSS";
  }

  return "UNKNOWN";
}

export function buildAnalytics(events: TradeEvent[]) {
  const exits = events.filter((event) => event.eventType === "EXIT");

  const totalTrades = exits.length;
  const wins = exits.filter((event) => {
    const outcome = getOutcome(event);
    return outcome === "TP" || outcome === "WIN";
  }).length;

  const losses = exits.filter((event) => {
    const outcome = getOutcome(event);
    return outcome === "SL" || outcome === "LOSS";
  }).length;

  const totalR = exits.reduce((sum, event) => sum + (event.exitR || 0), 0);
  const totalPnl = exits.reduce((sum, event) => sum + (event.pnlPct || 0), 0);

  const cohortsMap = new Map<
    string,
    {
      cohortKey: string;
      trades: number;
      wins: number;
      losses: number;
      be: number;
      totalR: number;
      totalPnl: number;
      symbols: Set<string>;
      sides: Set<string>;
      grades: Set<string>;
      setupClasses: Set<string>;
    }
  >();

  for (const event of exits) {
    const key = event.cohortKey || "NO_COHORT";

    if (!cohortsMap.has(key)) {
      cohortsMap.set(key, {
        cohortKey: key,
        trades: 0,
        wins: 0,
        losses: 0,
        be: 0,
        totalR: 0,
        totalPnl: 0,
        symbols: new Set(),
        sides: new Set(),
        grades: new Set(),
        setupClasses: new Set()
      });
    }

    const row = cohortsMap.get(key)!;
    const outcome = getOutcome(event);

    row.trades += 1;
    row.totalR += event.exitR || 0;
    row.totalPnl += event.pnlPct || 0;
    row.symbols.add(event.symbol);
    row.sides.add(event.side);

    if (event.grade) row.grades.add(event.grade);
    if (event.setupClass) row.setupClasses.add(event.setupClass);

    if (outcome === "TP" || outcome === "WIN") row.wins += 1;
    if (outcome === "SL" || outcome === "LOSS") row.losses += 1;
    if (outcome === "BE") row.be += 1;
  }

  const cohorts = Array.from(cohortsMap.values())
    .map((row) => {
      const winrate = row.trades ? row.wins / row.trades : 0;
      const wilson = wilsonLower(row.wins, row.trades);

      return {
        cohortKey: row.cohortKey,
        trades: row.trades,
        wins: row.wins,
        losses: row.losses,
        be: row.be,
        winrate: round(winrate * 100, 2),
        wilsonLower: round(wilson * 100, 2),
        totalR: round(row.totalR, 3),
        avgR: round(row.totalR / Math.max(row.trades, 1), 3),
        totalPnl: round(row.totalPnl, 3),
        avgPnl: round(row.totalPnl / Math.max(row.trades, 1), 3),
        symbols: Array.from(row.symbols).join(", "),
        sides: Array.from(row.sides).join(", "),
        grades: Array.from(row.grades).join(", "),
        setupClasses: Array.from(row.setupClasses).join(", ")
      };
    })
    .sort((a, b) => {
      if (b.totalR !== a.totalR) return b.totalR - a.totalR;
      return b.wilsonLower - a.wilsonLower;
    });

  return {
    summary: {
      totalTrades,
      wins,
      losses,
      winrate: round((wins / Math.max(totalTrades, 1)) * 100, 2),
      wilsonLower: round(wilsonLower(wins, totalTrades) * 100, 2),
      totalR: round(totalR, 3),
      avgR: round(totalR / Math.max(totalTrades, 1), 3),
      totalPnl: round(totalPnl, 3),
      avgPnl: round(totalPnl / Math.max(totalTrades, 1), 3)
    },
    cohorts
  };
}