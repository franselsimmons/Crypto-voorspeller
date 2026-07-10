export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const round = (v, d = 2) => (isNum(v) ? Number(v.toFixed(d)) : null);

export function tickDecimals(tick) {
  if (!isNum(tick) || tick <= 0) return 6;
  const s = tick.toExponential();
  const m = /e-(\d+)/.exec(s);
  const base = m ? Number(m[1]) : 0;
  const frac = String(tick).split(".")[1] || "";
  return Math.max(base, frac.length);
}

export function priceStr(v, tick) {
  if (!isNum(v)) return "—";
  return v.toFixed(tickDecimals(tick));
}
