// api/_lib/flowEngine.js
// Simpele maar professionele flow & shock layer

import { clamp } from "./indicators.js";

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

// 1️⃣ Funding bias (synthetisch via candle structuur)
// Als candle bodies structureel negatief zijn + volume hoog
// dan lijkt funding vaak negatief
export function computeFundingBias(candles, lookback = 20) {
  if (!candles || candles.length < lookback + 5) return 0;

  let score = 0;

  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;

    const body = c.close - c.open;
    const range = Math.max(1e-9, c.high - c.low);

    const bodyPct = body / range;

    score += bodyPct;
  }

  const avg = score / lookback;

  // positief = bull funding, negatief = bear funding
  return clamp(avg, -1, 1);
}


// 2️⃣ Liquidation cluster proxy
// Grote wick + groot volume = mogelijk liquidation event
export function computeLiquidationPressure(candles, lookback = 40) {
  if (!candles || candles.length < lookback + 5) return 0;

  let pressure = 0;

  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (range === 0) continue;

    // grote wick = liquidaties
    const wickStrength = (upperWick + lowerWick) / range;

    pressure += wickStrength;
  }

  const avg = pressure / lookback;

  return clamp(avg, 0, 1);
}


// 3️⃣ Weekend thin liquidity detectie
export function weekendLiquidityPenalty(lastTime) {
  if (!isNum(lastTime)) return 0;

  const d = new Date(lastTime * 1000);
  const day = d.getUTCDay(); // 0 zondag, 6 zaterdag

  if (day === 0 || day === 6) return 0.2;

  return 0;
}


// 4️⃣ Regime flip probability
export function computeFlipProbability({
  zNow,
  bandsNow,
  stabilityScore,
  adxNow
}) {
  if (!isNum(zNow)) return 0;

  const { p35, p65 } = bandsNow || {};
  if (!isNum(p35) || !isNum(p65)) return 0;

  const mid = (p35 + p65) / 2;
  const dist = Math.abs(zNow - mid);

  const proximity = clamp(1 - dist, 0, 1);

  const adxPenalty = isNum(adxNow)
    ? clamp(1 - (adxNow / 50), 0, 1)
    : 0.5;

  const stabilityPenalty = clamp(1 - (stabilityScore / 100), 0, 1);

  const prob =
    proximity * 0.5 +
    adxPenalty * 0.3 +
    stabilityPenalty * 0.2;

  return Math.round(clamp(prob * 100, 0, 100));
}