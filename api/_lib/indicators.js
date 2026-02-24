// api/_lib/indicators.js
// Kleine indicator helpers, puur JS.

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function safeNum(x) {
  return isNum(x) ? x : null;
}

// -------------------- SMA --------------------
export function sma(values, length) {
  const out = Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length === 0) return out;
  if (length <= 1) return values.map(safeNum);

  let sum = 0;
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    const v = safeNum(values[i]);
    if (v != null) {
      sum += v;
      count++;
    }

    if (i >= length) {
      const old = safeNum(values[i - length]);
      if (old != null) {
        sum -= old;
        count--;
      }
    }

    // Alleen SMA als we echt "length" geldige punten in het window hebben
    out[i] = (i >= length - 1 && count === length) ? (sum / length) : null;
  }

  return out;
}

// -------------------- EMA --------------------
export function ema(values, length) {
  const out = Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length === 0) return out;
  if (length <= 1) return values.map(safeNum);

  const k = 2 / (length + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = safeNum(values[i]);
    if (v == null) {
      out[i] = prev; // EMA blijft doorlopen, maar we tekenen hier de laatste waarde
      continue;
    }
    prev = (prev == null) ? v : (v * k + prev * (1 - k));
    out[i] = prev;
  }

  return out;
}

// -------------------- KAMA --------------------
// KAMA (Kaufman Adaptive Moving Average)
export function kama(values, erLen = 10, fast = 2, slow = 30) {
  const out = Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length === 0) return out;

  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);

  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = safeNum(values[i]);
    if (v == null) {
      out[i] = prev;
      continue;
    }

    if (i < erLen) {
      prev = (prev == null) ? v : prev;
      out[i] = prev;
      continue;
    }

    const vBack = safeNum(values[i - erLen]);
    if (vBack == null) {
      out[i] = prev;
      continue;
    }

    // ER = change / volatility
    const change = Math.abs(v - vBack);

    let vol = 0;
    let ok = true;
    for (let k = i - erLen + 1; k <= i; k++) {
      const a = safeNum(values[k]);
      const b = safeNum(values[k - 1]);
      if (a == null || b == null) { ok = false; break; }
      vol += Math.abs(a - b);
    }

    if (!ok || vol === 0) {
      prev = (prev == null) ? v : prev;
      out[i] = prev;
      continue;
    }

    const er = change / vol;
    const sc = (er * (fastSC - slowSC) + slowSC);
    const sc2 = sc * sc;

    prev = (prev == null) ? v : (prev + sc2 * (v - prev));
    out[i] = prev;
  }

  return out;
}

// -------------------- STD --------------------
export function std(values, length) {
  const out = Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length === 0) return out;
  if (length <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;

    // vaste window
    let sum = 0;
    let sum2 = 0;
    let count = 0;

    for (let k = i - length + 1; k <= i; k++) {
      const v = safeNum(values[k]);
      if (v == null) { count = -1; break; } // we eisen full window
      sum += v;
      sum2 += v * v;
      count++;
    }

    if (count !== length) continue;

    const mean = sum / length;
    const varr = (sum2 / length) - (mean * mean);
    out[i] = Math.sqrt(Math.max(0, varr));
  }

  return out;
}
export const stdev = std;

// -------------------- ATR --------------------
export function atr(highs, lows, closes, length = 14) {
  const n = closes?.length ?? 0;
  const tr = Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const h = safeNum(highs?.[i]);
    const l = safeNum(lows?.[i]);
    const c = safeNum(closes?.[i]);

    if (h == null || l == null || c == null) {
      tr[i] = null;
      continue;
    }

    if (i === 0) {
      tr[i] = h - l;
      continue;
    }

    const pClose = safeNum(closes?.[i - 1]);
    if (pClose == null) {
      tr[i] = h - l;
      continue;
    }

    const hl = h - l;
    const hc = Math.abs(h - pClose);
    const lc = Math.abs(l - pClose);
    tr[i] = Math.max(hl, hc, lc);
  }

  // Wilder smoothing
  const out = Array(n).fill(null);
  let prev = null;
  for (let i = 0; i < n; i++) {
    const v = safeNum(tr[i]);
    if (v == null) {
      out[i] = prev;
      continue;
    }
    prev = (prev == null) ? v : ((prev * (length - 1) + v) / length);
    out[i] = prev;
  }

  return out;
}

// -------------------- OBV --------------------
export function obv(closes, volumes) {
  const n = closes?.length ?? 0;
  const out = Array(n).fill(null);

  let cur = 0;
  for (let i = 0; i < n; i++) {
    const c = safeNum(closes?.[i]);
    const p = safeNum(closes?.[i - 1]);
    const v = safeNum(volumes?.[i]) ?? 0;

    if (i === 0) {
      cur = 0;
      out[i] = cur;
      continue;
    }

    if (c == null || p == null) {
      out[i] = cur;
      continue;
    }

    if (c > p) cur += v;
    else if (c < p) cur -= v;

    out[i] = cur;
  }
  return out;
}

// -------------------- ADX (Wilder) --------------------
export function adx(highs, lows, closes, length = 14) {
  const n = closes?.length ?? 0;
  const out = Array(n).fill(null);

  const tr = Array(n).fill(null);
  const plusDM = Array(n).fill(null);
  const minusDM = Array(n).fill(null);

  for (let i = 1; i < n; i++) {
    const hi = safeNum(highs?.[i]);
    const hi1 = safeNum(highs?.[i - 1]);
    const lo = safeNum(lows?.[i]);
    const lo1 = safeNum(lows?.[i - 1]);
    const c1 = safeNum(closes?.[i - 1]);

    if (hi == null || hi1 == null || lo == null || lo1 == null) continue;

    const upMove = hi - hi1;
    const downMove = lo1 - lo;

    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const hl = hi - lo;

    if (c1 == null) {
      tr[i] = hl;
      continue;
    }

    const hc = Math.abs(hi - c1);
    const lc = Math.abs(lo - c1);
    tr[i] = Math.max(hl, hc, lc);
  }

  function wilderSmooth(arr) {
    const s = Array(n).fill(null);
    let prev = null;
    for (let i = 0; i < n; i++) {
      const v = safeNum(arr[i]);
      if (v == null) {
        s[i] = prev;
        continue;
      }
      prev = (prev == null) ? v : (prev - (prev / length) + v);
      s[i] = prev;
    }
    return s;
  }

  const trS = wilderSmooth(tr);
  const pS = wilderSmooth(plusDM);
  const mS = wilderSmooth(minusDM);

  const dx = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const trv = safeNum(trS[i]);
    const pv = safeNum(pS[i]);
    const mv = safeNum(mS[i]);
    if (trv == null || trv === 0 || pv == null || mv == null) continue;

    const pDI = 100 * (pv / trv);
    const mDI = 100 * (mv / trv);
    const denom = pDI + mDI;
    if (!isNum(denom) || denom === 0) continue;

    dx[i] = 100 * (Math.abs(pDI - mDI) / denom);
  }

  // ADX = Wilder EMA of DX
  let prev = null;
  for (let i = 0; i < n; i++) {
    const v = safeNum(dx[i]);
    if (v == null) {
      out[i] = prev;
      continue;
    }
    prev = (prev == null) ? v : ((prev * (length - 1) + v) / length);
    out[i] = prev;
  }

  return out;
}

// -------------------- Percentile + Clamp --------------------
export function percentileFromWindow(window, p) {
  if (!Array.isArray(window) || window.length === 0) return null;
  const arr = window.map(safeNum).filter((x) => x != null).sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * (arr.length - 1))));
  return arr[idx];
}

export function clamp(x, lo, hi) {
  if (!isNum(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}