// api/_lib/indicators.js
// Kleine indicator helpers, puur JS.

export function sma(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();
  let sum = 0;
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = null;
      continue;
    }
    sum += v;
    n++;

    if (i >= length) {
      const old = values[i - length];
      if (old != null) {
        sum -= old;
        n--;
      }
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
    if (v == null) {
      out[i] = null;
      continue;
    }
    if (prev == null) prev = v;
    prev = (v * k) + (prev * (1 - k));
    out[i] = prev;
  }
  return out;
}

// KAMA (Kaufman Adaptive Moving Average)
export function kama(values, erLen = 10, fast = 2, slow = 30) {
  const out = Array(values.length).fill(null);
  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);

  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    if (i < erLen) {
      prev = (prev == null) ? v : prev;
      out[i] = prev;
      continue;
    }

    // ER = change / volatility
    const change = Math.abs(values[i] - values[i - erLen]);
    let vol = 0;
    for (let k = i - erLen + 1; k <= i; k++) {
      vol += Math.abs(values[k] - values[k - 1]);
    }
    const er = (vol === 0) ? 0 : (change / vol);

    const sc = (er * (fastSC - slowSC) + slowSC);
    const sc2 = sc * sc;

    if (prev == null) prev = v;
    prev = prev + sc2 * (v - prev);
    out[i] = prev;
  }
  return out;
}

export function std(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const window = values.slice(i - length + 1, i + 1).filter((x) => x != null);
    if (window.length < length) continue;

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const varr = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    out[i] = Math.sqrt(varr);
  }
  return out;
}
export const stdev = std;

export function atr(highs, lows, closes, length = 14) {
  const tr = Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
      continue;
    }
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

// OBV (On Balance Volume)
export function obv(closes, volumes) {
  const out = Array(closes.length).fill(null);
  let cur = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { out[i] = 0; continue; }
    const c = closes[i], p = closes[i - 1];
    const v = volumes[i] ?? 0;
    if (c > p) cur += v;
    else if (c < p) cur -= v;
    out[i] = cur;
  }
  return out;
}

// ADX (Wilder)
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

  function wilderSmooth(arr) {
    const s = Array(n).fill(null);
    let prev = null;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v == null) continue;
      if (prev == null) prev = v;
      else prev = prev - (prev / length) + v;
      s[i] = prev;
    }
    return s;
  }

  const trS = wilderSmooth(tr);
  const pS = wilderSmooth(plusDM);
  const mS = wilderSmooth(minusDM);

  const dx = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (trS[i] == null || trS[i] === 0) continue;
    const pDI = 100 * (pS[i] / trS[i]);
    const mDI = 100 * (mS[i] / trS[i]);
    const denom = (pDI + mDI);
    if (denom === 0) continue;
    dx[i] = 100 * (Math.abs(pDI - mDI) / denom);
  }

  // ADX = Wilder EMA of DX
  let prev = null;
  for (let i = 0; i < n; i++) {
    const v = dx[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    else prev = (prev * (length - 1) + v) / length;
    out[i] = prev;
  }

  return out;
}

export function percentileFromWindow(window, p) {
  const arr = window.filter((x) => x != null).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * (arr.length - 1))));
  return arr[idx];
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// ------------------------------
// ✅ ROBUST helpers (fat tails)
// ------------------------------
export function median(arr) {
  const a = arr.filter(x => x != null && Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
}

export function mad(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const win = values.slice(i - length + 1, i + 1);
    const m = median(win);
    if (m == null) continue;

    const dev = win.map(v => (v == null ? null : Math.abs(v - m)));
    const m2 = median(dev);
    if (m2 == null || m2 === 0) continue;

    // 1.4826 maakt MAD vergelijkbaar met std bij normaalverdeling
    out[i] = 1.4826 * m2;
  }
  return out;
}

// ------------------------------
// ✅ Pivots / swing structuur
// ------------------------------
export function pivotHigh(highs, left = 3, right = 3) {
  const n = highs.length;
  const out = Array(n).fill(false);
  for (let i = left; i < n - right; i++) {
    const h = highs[i];
    if (h == null) continue;
    let ok = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k === i) continue;
      if (highs[k] == null) { ok = false; break; }
      if (highs[k] >= h) { ok = false; break; }
    }
    out[i] = ok;
  }
  return out;
}

export function pivotLow(lows, left = 3, right = 3) {
  const n = lows.length;
  const out = Array(n).fill(false);
  for (let i = left; i < n - right; i++) {
    const l = lows[i];
    if (l == null) continue;
    let ok = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k === i) continue;
      if (lows[k] == null) { ok = false; break; }
      if (lows[k] <= l) { ok = false; break; }
    }
    out[i] = ok;
  }
  return out;
}

export function lastSwingLevels(highs, lows, left = 3, right = 3, lookback = 200) {
  const ph = pivotHigh(highs, left, right);
  const pl = pivotLow(lows, left, right);

  let lastHigh = null;
  let lastLow = null;

  const start = Math.max(0, highs.length - lookback);
  for (let i = highs.length - 1; i >= start; i--) {
    if (lastHigh == null && ph[i]) lastHigh = highs[i];
    if (lastLow == null && pl[i]) lastLow = lows[i];
    if (lastHigh != null && lastLow != null) break;
  }

  return { lastSwingHigh: lastHigh, lastSwingLow: lastLow };
}