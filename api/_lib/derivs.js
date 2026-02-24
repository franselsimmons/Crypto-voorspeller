// api/_lib/derivs.js
function isNum(x){ return typeof x === "number" && Number.isFinite(x); }

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6500);

  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; ForestBot/1.0; +https://vercel.app)"
      }
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0,120)}`);
    return JSON.parse(txt);
  } finally {
    clearTimeout(t);
  }
}

// ✅ Funding (primary) Binance Futures premiumIndex -> lastFundingRate
async function fundingBinance() {
  const url = "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";
  const j = await fetchJson(url);
  const fr = Number(j?.lastFundingRate);
  if (!isNum(fr)) throw new Error("No lastFundingRate");
  return fr;
}

// ✅ Funding (fallback) Bybit public funding rate
async function fundingBybit() {
  // Bybit v5 public: funding rate BTCUSDT (linear)
  const url = "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT";
  const j = await fetchJson(url);
  const fr = Number(j?.result?.list?.[0]?.fundingRate);
  if (!isNum(fr)) throw new Error("No fundingRate");
  return fr;
}

export async function fetchBtcFundingBias() {
  try {
    let fr = null;

    try {
      fr = await fundingBinance();
    } catch {
      fr = await fundingBybit();
    }

    // fr > 0 => longs betalen => contrarian kleine BEAR bias
    // fr < 0 => shorts betalen => contrarian kleine BULL bias
    const fundingBias = Math.max(-0.003, Math.min(0.003, -fr * 8));
    const fundingFlip = Math.abs(fr) >= 0.0005;

    return { fundingRate: fr, fundingBias, fundingFlip, fundingSource: "binance/bybit" };
  } catch {
    return { fundingRate: null, fundingBias: 0, fundingFlip: false, fundingSource: null };
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