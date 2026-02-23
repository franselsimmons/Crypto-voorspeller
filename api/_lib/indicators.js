// api/_lib/indicators.js
// Kleine indicator helpers, puur JS.

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
    out[i] = i >= length - 1 ? sum / length : null;
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
    prev = v * k + prev * (1 - k);
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

export function percentileFromWindow(window, p) {
  const arr = window.filter((x) => x != null).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * (arr.length - 1))));
  return arr[idx];
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// --------- ROBUST (fat-tail) ---------

export function median(arr) {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function mad(values, length) {
  // Median Absolute Deviation (rolling)
  const out = Array(values.length).fill(null);
  if (length <= 2) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const win = values.slice(i - length + 1, i + 1).filter((x) => x != null);
    if (win.length < length) continue;

    const med = median(win);
    const dev = win.map((x) => Math.abs(x - med));
    const m = median(dev);

    out[i] = m; // NOTE: sigma approx = 1.4826 * MAD
  }
  return out;
}

// --------- KAMA ---------

export function kama(values, erLen = 10, fastLen = 2, slowLen = 30) {
  const out = Array(values.length).fill(null);
  const fastSC = 2 / (fastLen + 1);
  const slowSC = 2 / (slowLen + 1);

  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    if (prev == null) {
      prev = v;
      out[i] = prev;
      continue;
    }

    if (i < erLen) {
      // nog niet genoeg data: gedraag je als EMA-ish
      prev = prev + (v - prev) * slowSC;
      out[i] = prev;
      continue;
    }

    const change = Math.abs(values[i] - values[i - erLen]);
    let volatility = 0;
    for (let k = i - erLen + 1; k <= i; k++) {
      volatility += Math.abs(values[k] - values[k - 1]);
    }
    const er = volatility === 0 ? 0 : (change / volatility);

    const sc = (er * (fastSC - slowSC) + slowSC) ** 2;
    prev = prev + sc * (v - prev);
    out[i] = prev;
  }

  return out;
}

// --------- simpele “dominante cyclus” ---------
// We kiezen de shift (lag) waarbij resid het best “meeloopt” met zichzelf.
// Dit geeft een bruikbare golf-lengte zonder zware FFT.

export function dominantCycleLength(resid, minLag, maxLag) {
  // returns lag in bars
  const n = resid.length;
  if (n < maxLag + 10) return Math.round((minLag + maxLag) / 2);

  let bestLag = minLag;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0, denA = 0, denB = 0;
    let count = 0;

    // pak laatste ~200 punten (sneller + relevanter)
    const start = Math.max(0, n - 240);
    for (let i = start + lag; i < n; i++) {
      const a = resid[i];
      const b = resid[i - lag];
      if (a == null || b == null) continue;
      num += a * b;
      denA += a * a;
      denB += b * b;
      count++;
    }

    if (count < 50) continue;
    const corr = (denA === 0 || denB === 0) ? 0 : (num / Math.sqrt(denA * denB));

    // penalize extreem lange lags een beetje
    const score = corr - 0.0005 * lag;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestLag;
}