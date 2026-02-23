// api/_lib/indicators.js

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function sma(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();
  let sum = 0;
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = null; continue; }
    sum += v; n++;

    if (i >= length) {
      const old = values[i - length];
      if (old != null) { sum -= old; n--; }
    }
    out[i] = (i >= length - 1) ? (sum / length) : null;
  }
  return out;
}

export function ema(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();
  const k = 2 / (length + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = null; continue; }
    if (prev == null) prev = v;
    prev = (v * k) + (prev * (1 - k));
    out[i] = prev;
  }
  return out;
}

// KAMA (adaptief, minder whipsaw dan EMA)
export function kama(values, erLen = 10, fast = 2, slow = 30) {
  const out = Array(values.length).fill(null);
  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);

  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = null; continue; }
    if (prev == null) { prev = v; out[i] = prev; continue; }
    if (i < erLen) { prev = v; out[i] = prev; continue; }

    const change = Math.abs(values[i] - values[i - erLen]);
    let volatility = 0;
    for (let k = i - erLen + 1; k <= i; k++) {
      volatility += Math.abs(values[k] - values[k - 1]);
    }
    const er = volatility === 0 ? 0 : (change / volatility);
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);

    prev = prev + sc * (v - prev);
    out[i] = prev;
  }
  return out;
}

export function atr(highs, lows, closes, length = 14) {
  const tr = Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { tr[i] = highs[i] - lows[i]; continue; }
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  // Wilder smoothing
  const out = Array(closes.length).fill(null);
  let prev = null;
  for (let i = 0; i < tr.length; i++) {
    const v = tr[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    prev = (prev * (length - 1) + v) / length;
    out[i] = prev;
  }
  return out;
}

// Robust “std”: MAD -> sigma-achtige schaal
export function madSigma(values, length) {
  const out = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const w = values.slice(i - length + 1, i + 1).filter(v => v != null);
    if (w.length < length) continue;

    const sorted = w.slice().sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;

    const absDev = w.map(v => Math.abs(v - median)).sort((a,b)=>a-b);
    const mid2 = Math.floor(absDev.length/2);
    const mad = absDev.length % 2 ? absDev[mid2] : (absDev[mid2-1]+absDev[mid2])/2;

    // 1.4826 ~ normalisatie naar “sigma”
    out[i] = 1.4826 * mad;
  }
  return out;
}

export function percentileFromWindow(window, p) {
  const arr = window.filter((x) => x != null).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * (arr.length - 1))));
  return arr[idx];
}

// ADX (trendsterkte)
export function adx(highs, lows, closes, length = 14) {
  const n = closes.length;
  const out = Array(n).fill(null);

  const tr = Array(n).fill(null);
  const plusDM = Array(n).fill(null);
  const minusDM = Array(n).fill(null);

  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  // Wilder smoothing
  const smTR = Array(n).fill(null);
  const smPlus = Array(n).fill(null);
  const smMinus = Array(n).fill(null);

  let trPrev = null, pPrev = null, mPrev = null;
  for (let i = 0; i < n; i++) {
    if (i === 0) continue;
    if (trPrev == null) {
      trPrev = tr[i]; pPrev = plusDM[i]; mPrev = minusDM[i];
    } else {
      trPrev = trPrev - (trPrev / length) + tr[i];
      pPrev = pPrev - (pPrev / length) + plusDM[i];
      mPrev = mPrev - (mPrev / length) + minusDM[i];
    }
    smTR[i] = trPrev; smPlus[i] = pPrev; smMinus[i] = mPrev;
  }

  const dx = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (smTR[i] == null || smTR[i] === 0) continue;
    const pDI = 100 * (smPlus[i] / smTR[i]);
    const mDI = 100 * (smMinus[i] / smTR[i]);
    const denom = (pDI + mDI);
    dx[i] = denom === 0 ? 0 : 100 * (Math.abs(pDI - mDI) / denom);
  }

  // ADX = Wilder EMA van DX
  let adxPrev = null;
  for (let i = 0; i < n; i++) {
    const v = dx[i];
    if (v == null) continue;
    if (adxPrev == null) adxPrev = v;
    adxPrev = (adxPrev * (length - 1) + v) / length;
    out[i] = adxPrev;
  }

  return out;
}