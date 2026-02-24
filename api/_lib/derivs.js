// api/_lib/derivs.js
function isNum(x){ return typeof x === "number" && Number.isFinite(x); }

// ✅ Funding (public) - Binance Futures premiumIndex -> lastFundingRate
export async function fetchBtcFundingBias() {
  try {
    const url = "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return { fundingRate: null, fundingBias: 0, fundingFlip: false };

    const j = await r.json();
    const fr = Number(j?.lastFundingRate);
    if (!isNum(fr)) return { fundingRate: null, fundingBias: 0, fundingFlip: false };

    // fr > 0 => longs betalen => contrarian kleine BEAR bias
    // fr < 0 => shorts betalen => contrarian kleine BULL bias
    const fundingBias = Math.max(-0.003, Math.min(0.003, -fr * 8));
    const fundingFlip = Math.abs(fr) >= 0.0005;

    return { fundingRate: fr, fundingBias, fundingFlip };
  } catch {
    return { fundingRate: null, fundingBias: 0, fundingFlip: false };
  }
}

// ✅ Synthetic liq levels (proxy): volume bins van typical price
export function buildSyntheticLiqLevels(candles, {
  lookback = 180,
  bins = 48,
  topN = 8
} = {}) {
  if (!Array.isArray(candles) || candles.length < 50) return [];

  const slice = candles.slice(Math.max(0, candles.length - lookback));
  let lo = Infinity, hi = -Infinity;

  for (const c of slice) {
    if (!isNum(c.low) || !isNum(c.high)) continue;
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  if (!isNum(lo) || !isNum(hi) || !(hi > lo)) return [];

  const step = (hi - lo) / bins;
  const hist = Array(bins).fill(0);

  for (const c of slice) {
    const tp = (c.high + c.low + c.close) / 3;
    const v = isNum(c.volume) ? c.volume : 0;
    if (!isNum(tp) || !isNum(v)) continue;
    const idx = Math.max(0, Math.min(bins - 1, Math.floor((tp - lo) / step)));
    hist[idx] += v;
  }

  const levels = hist
    .map((w, i) => ({ price: lo + step * (i + 0.5), weight: w }))
    .filter(x => isNum(x.price) && isNum(x.weight))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN)
    .sort((a, b) => a.price - b.price);

  const maxW = levels.reduce((m, x) => Math.max(m, x.weight), 0) || 1;
  return levels.map(x => ({
    price: x.price,
    weight: Math.max(0, Math.min(1, x.weight / maxW))
  }));
}

// ✅ liq=price:weight,price:weight...
export function parseLiqLevelsFromQuery(str) {
  if (!str || typeof str !== "string") return [];
  const parts = str.split(",").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const [a, b] = p.split(":").map(s => s.trim());
    const price = Number(a);
    const weight = b == null ? 1 : Number(b);
    if (!isNum(price)) continue;
    out.push({
      price,
      weight: isNum(weight) ? Math.max(0, Math.min(1, weight)) : 1
    });
  }
  return out.sort((x, y) => x.price - y.price);
}

// ✅ liqB64= base64(JSON array)
export function parseLiqLevelsB64(b64) {
  try {
    if (!b64 || typeof b64 !== "string") return [];
    const json = Buffer.from(b64, "base64").toString("utf8");
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(x => ({ price: Number(x?.price), weight: Number(x?.weight) }))
      .filter(x => isNum(x.price))
      .map(x => ({ price: x.price, weight: isNum(x.weight) ? Math.max(0, Math.min(1, x.weight)) : 1 }))
      .sort((a, b) => a.price - b.price);
  } catch {
    return [];
  }
}