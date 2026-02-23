// api/_lib/indicators.js

export function sma(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    sum += v;

    if (i >= length) {
      const old = values[i - length];
      if (old != null) sum -= old;
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
    if (v == null) continue;
    if (prev == null) prev = v;
    prev = (v * k) + (prev * (1 - k));
    out[i] = prev;
  }
  return out;
}

// Wilder RMA (voor ATR/ADX)
export function rma(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    prev = (prev * (length - 1) + v) / length;
    out[i] = prev;
  }
  return out;
}

export function std(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const w = values.slice(i - length + 1, i + 1).filter(x => x != null);
    if (w.length < length) continue;
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const varr = w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length;
    out[i] = Math.sqrt(varr);
  }
  return out;
}

// Robust: MAD (fat-tail fix)
export function mad(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const w = values.slice(i - length + 1, i + 1).filter(x => x != null).slice().sort((a, b) => a - b);
    if (w.length < length) continue;
    const mid = Math.floor(w.length / 2);
    const med = (w.length % 2) ? w[mid] : (w[mid - 1] + w[mid]) / 2;

    const dev = w.map(x => Math.abs(x - med)).sort((a, b) => a - b);
    const mid2 = Math.floor(dev.length / 2);
    const madv = (dev.length % 2) ? dev[mid2] : (dev[mid2 - 1] + dev[mid2]) / 2;

    // 1.4826 maakt MAD vergelijkbaar met std bij normale verdeling
    out[i] = 1.4826 * madv;
  }
  return out;
}

export const stdev = std;

export function atr(highs, lows, closes, length = 14) {
  const tr = Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { tr[i] = highs[i] - lows[i]; continue; }
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  return rma(tr, length);
}

export function adx(highs, lows, closes, length = 14) {
  const dmPlus = Array(closes.length).fill(null);
  const dmMinus = Array(closes.length).fill(null);
  const tr = Array(closes.length).fill(null);

  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    dmPlus[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    dmMinus[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  const trRma = rma(tr, length);
  const dmPRma = rma(dmPlus, length);
  const dmMRma = rma(dmMinus, length);

  const diPlus = trRma.map((t, i) => (t && dmPRma[i] != null) ? (100 * dmPRma[i] / t) : null);
  const diMinus = trRma.map((t, i) => (t && dmMRma[i] != null) ? (100 * dmMRma[i] / t) : null);

  const dx = diPlus.map((p, i) => {
    const m = diMinus[i];
    if (p == null || m == null || (p + m) === 0) return null;
    return 100 * (Math.abs(p - m) / (p + m));
  });

  return rma(dx, length);
}

export function percentileFromWindow(window, p) {
  const arr = window.filter(x => x != null).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * (arr.length - 1))));
  return arr[idx];
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}