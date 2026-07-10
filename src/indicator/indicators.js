/** Pure indicatorfuncties, Pine-getrouw. Arrays retourneren null waar Pine na geeft. */

export function smaArr(values, len) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= len) sum -= values[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

/** Pine ta.ema: eerste waarde = source; daarna alpha-recursie. Transient <1e-4 na warmup. */
export function emaPine(values, len) {
  const out = new Array(values.length).fill(null);
  const alpha = 2 / (len + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    prev = prev == null ? values[i] : alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** Wilder RMA, seed = SMA van eerste len (Pine ta.rma). */
export function rmaArr(values, len) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (prev == null) {
      sum += values[i];
      if (i === len - 1) { prev = sum / len; out[i] = prev; }
    } else {
      prev = (prev * (len - 1) + values[i]) / len;
      out[i] = prev;
    }
  }
  return out;
}

export function trueRangeArr(candles) {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

export const atrArr = (candles, len) => rmaArr(trueRangeArr(candles), len);

export function rsiArr(closes, len) {
  const n = closes.length;
  const up = new Array(n).fill(0);
  const dn = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    up[i] = Math.max(ch, 0);
    dn[i] = Math.max(-ch, 0);
  }
  const ru = rmaArr(up.slice(1), len);
  const rd = rmaArr(dn.slice(1), len);
  const out = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const u = ru[i - 1], d = rd[i - 1];
    if (u == null || d == null) continue;
    out[i] = d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d);
  }
  return out;
}

/** Kaufman ER per Pine f_er. */
export function erArr(closes, len) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  let noise = 0;
  for (let i = 1; i < n; i++) {
    noise += Math.abs(closes[i] - closes[i - 1]);
    if (i > len) noise -= Math.abs(closes[i - len] - closes[i - len - 1]);
    if (i >= len) {
      const move = Math.abs(closes[i] - closes[i - len]);
      out[i] = noise > 0 ? move / noise : 0;
    }
  }
  return out;
}

/**
 * Pine ta.percentrank: % van de vórige len waarden dat <= huidige is
 * (huidige bar uitgesloten; tie-regel <=, pin A1 via parity-fixtures).
 */
export function percentRankArr(values, len) {
  const n = values.length;
  const out = new Array(n).fill(null);
  for (let i = len; i < n; i++) {
    const cur = values[i];
    if (cur == null) continue;
    let cnt = 0, valid = true;
    for (let j = i - len; j < i; j++) {
      const v = values[j];
      if (v == null) { valid = false; break; }
      if (v <= cur) cnt++;
    }
    if (valid) out[i] = (cnt / len) * 100;
  }
  return out;
}

export function highestArr(values, len) {
  const n = values.length;
  const out = new Array(n).fill(null);
  for (let i = len - 1; i < n; i++) {
    let m = -Infinity, valid = true;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) { valid = false; break; }
      if (v > m) m = v;
    }
    if (valid) out[i] = m;
  }
  return out;
}

export function lowestArr(values, len) {
  const n = values.length;
  const out = new Array(n).fill(null);
  for (let i = len - 1; i < n; i++) {
    let m = Infinity, valid = true;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) { valid = false; break; }
      if (v < m) m = v;
    }
    if (valid) out[i] = m;
  }
  return out;
}

/** Pine ta.cross (beide richtingen). */
export function crossArrFn(a, b) {
  const n = a.length;
  const out = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) continue;
    out[i] = (a[i] > b[i] && a[i - 1] <= b[i - 1]) || (a[i] < b[i] && a[i - 1] >= b[i - 1]);
  }
  return out;
}
