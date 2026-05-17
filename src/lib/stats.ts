export function wilsonLowerBound(wins: number, total: number, z = 1.96): number {
  if (!total) return 0;

  const p = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;

  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return (center - margin) / denominator;
}

export function profitFactor(values: number[]): number | null {
  let grossWin = 0;
  let grossLoss = 0;

  for (const value of values) {
    if (value > 0) grossWin += value;
    if (value < 0) grossLoss += Math.abs(value);
  }

  if (grossLoss === 0) return grossWin > 0 ? 999 : null;
  return grossWin / grossLoss;
}

export function expectancy(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function maxDrawdown(values: number[]): number {
  let equity = 0;
  let peak = 0;
  let maxDd = 0;

  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
  }

  return maxDd;
}

export function objectiveScore(params: {
  trades: number;
  wins: number;
  totalR: number;
  avgR: number;
  pnl: number;
  directSlPct: number;
  winrateWeight: number;
  pnlWeight: number;
  avgRWeight: number;
  totalRWeight: number;
  directSlPenalty: number;
  minTrades: number;
}): number {
  if (params.trades < params.minTrades) return -999999;

  const wilson = wilsonLowerBound(params.wins, params.trades);
  const pnlComponent = params.pnl / 100;
  const directSlPenalty = (params.directSlPct / 100) * params.directSlPenalty;

  return (
    wilson * params.winrateWeight +
    pnlComponent * params.pnlWeight +
    params.avgR * params.avgRWeight +
    params.totalR * 0.05 * params.totalRWeight -
    directSlPenalty
  );
}