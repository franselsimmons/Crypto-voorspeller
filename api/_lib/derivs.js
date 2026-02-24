// api/_lib/derivs.js
// Derivatives helpers: funding bias + liquidation levels
// Werkt zonder API keys (public endpoints) + fallback op synthetic.

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

async function fetchJson(url, { timeoutMs = 3500 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 160)}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

// -----------------------------
// ✅ FUNDING (public / gratis)
// -----------------------------
// Return shape:
// { exchange, symbol, fundingRate, fundingBias, fundingFlip, ts }
export async function fetchBtcFundingBias() {
  // Binance Futures funding (public)
  // premiumIndex geeft "lastFundingRate"
  const url = "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";

  try {
    const j = await fetchJson(url, { timeoutMs: 3500 });

    const fr = Number(j?.lastFundingRate);
    const ts = Number(j?.time);

    if (!isNum(fr)) {
      return {
        exchange: "binance-futures",
        symbol: "BTCUSDT",
        fundingRate: null,
        fundingBias: 0,
        fundingFlip: false,
        ts: isNum(ts) ? ts : null,
        note: "no_funding_in_response",
      };
    }

    // Bias: pos funding = long crowding -> contrarian BEAR bias
    // Neg funding = short crowding -> contrarian BULL bias
    // Schaal: 0.002 (=0.2%) ≈ “best heftig”
    const mag = clamp(Math.abs(fr) / 0.002, 0, 1);
    const sign = fr > 0 ? -1 : fr < 0 ? +1 : 0;

    // max bias ongeveer +-0.0018 per bar (klein maar voelbaar in forward)
    const fundingBias = sign * (0.0007 + 0.0011 * mag);

    // “flip” = funding duidelijk positief of negatief (crowd staat scheef)
    const fundingFlip = Math.abs(fr) >= 0.00025; // 0.025%

    return {
      exchange: "binance-futures",
      symbol: "BTCUSDT",
      fundingRate: fr,
      fundingBias,
      fundingFlip,
      ts: isNum(ts) ? ts : null,
    };
  } catch (e) {
    // Als Binance blokt / timeout -> niks kapot, gewoon n/a
    return {
      exchange: "binance-futures",
      symbol: "BTCUSDT",
      fundingRate: null,
      fundingBias: 0,
      fundingFlip: false,
      ts: null,
      error: String(e?.message || e),
    };
  }
}

// ------------------------------------------
// ✅ LIQ LEVELS: query parser (liq=...)
// ------------------------------------------
// Formaat:
// liq=65000:0.8,62000:0.6,70000:0.3
export function parseLiqLevelsFromQuery(liqStr) {
  if (!liqStr || typeof liqStr !== "string") return [];

  const clean = liqStr.trim();
  if (!clean) return [];

  const parts = clean.split(",").map(s => s.trim()).filter(Boolean);
  const out = [];

  for (const p of parts) {
    const [a, b] = p.split(":").map(s => s.trim());
    const price = Number(a);
    const weight = Number(b);

    if (!isNum(price)) continue;
    out.push({
      price,
      weight: isNum(weight) ? clamp(weight, 0, 1) : 0.5
    });
  }

  return out;
}

// ------------------------------------------
// ✅ LIQ LEVELS: base64 parser (liqB64=...)
// ------------------------------------------
// liqB64 = base64(JSON.stringify([{price,weight}, ...]))
export function parseLiqLevelsB64(b64) {
  if (!b64 || typeof b64 !== "string") return [];
  const s = b64.trim();
  if (!s) return [];

  try {
    const json = Buffer.from(s, "base64").toString("utf8");
    const arr = JSON.parse(json);

    if (!Array.isArray(arr)) return [];
    const out = [];

    for (const it of arr) {
      const price = Number(it?.price);
      const weight = Number(it?.weight);
      if (!isNum(price)) continue;
      out.push({
        price,
        weight: isNum(weight) ? clamp(weight, 0, 1) : 0.5
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ------------------------------------------------------
// ✅ SYNTHETIC LIQ LEVELS (als je geen heatmap feed hebt)
// ------------------------------------------------------
// Idee (simpel maar effectief):
// - We maken bins tussen minLow en maxHigh
// - Elke candle “stemt” op bins waar prijs doorheen ging (wick range)
// - Touch count + range -> weight
export function buildSyntheticLiqLevels(candlesTruth, {
  lookback = 220,
  bins = 64,
  topN = 10
} = {}) {
  if (!Array.isArray(candlesTruth) || candlesTruth.length < 50) return [];

  const start = Math.max(0, candlesTruth.length - lookback);
  const slice = candlesTruth.slice(start);

  let minP = Infinity;
  let maxP = -Infinity;

  for (const c of slice) {
    const lo = Number(c?.low);
    const hi = Number(c?.high);
    if (!isNum(lo) || !isNum(hi)) continue;
    if (lo < minP) minP = lo;
    if (hi > maxP) maxP = hi;
  }

  if (!isNum(minP) || !isNum(maxP) || !(maxP > minP)) return [];

  const nBins = Math.max(16, Math.min(220, Math.floor(bins)));
  const step = (maxP - minP) / nBins;

  const score = Array(nBins).fill(0);

  for (const c of slice) {
    const lo = Number(c?.low);
    const hi = Number(c?.high);
    const op = Number(c?.open);
    const cl = Number(c?.close);
    if (!isNum(lo) || !isNum(hi) || !isNum(op) || !isNum(cl)) continue;

    // body vs wick: wick krijgt meer “liq touch” gewicht
    const body = Math.abs(cl - op);
    const range = Math.max(1e-9, hi - lo);
    const wickFactor = clamp(1 - (body / range), 0.15, 1.0);

    const iLo = clamp(Math.floor((lo - minP) / step), 0, nBins - 1);
    const iHi = clamp(Math.floor((hi - minP) / step), 0, nBins - 1);

    for (let i = iLo; i <= iHi; i++) {
      // dichter bij close = iets zwaarder, maar heel licht
      const binP = minP + (i + 0.5) * step;
      const dist = Math.abs(binP - cl) / Math.max(1, cl);
      const distBoost = clamp(1.0 - dist / 0.02, 0.25, 1.0); // binnen 2% = sterker

      score[i] += 1.0 * wickFactor * distBoost;
    }
  }

  // Pak top bins
  const ranked = score
    .map((s, i) => ({ i, s }))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(3, Math.min(topN, nBins)));

  const maxS = ranked.length ? ranked[0].s : 0;

  const out = ranked
    .filter(x => x.s > 0)
    .map(x => {
      const price = minP + (x.i + 0.5) * step;
      const weight = maxS > 0 ? clamp(x.s / maxS, 0, 1) : 0.5;
      return { price, weight };
    })
    .sort((a, b) => a.price - b.price);

  return out;
}