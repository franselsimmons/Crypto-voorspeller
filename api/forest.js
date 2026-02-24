// api/forest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

function parseLiqFromQuery(q) {
  // 1) liq = JSON string
  if (typeof q?.liq === "string" && q.liq.trim().startsWith("[")) {
    try {
      const j = JSON.parse(q.liq);
      if (Array.isArray(j)) return j;
    } catch {}
  }

  // 2) liqB64 = base64url JSON string
  if (typeof q?.liqB64 === "string" && q.liqB64.length > 10) {
    try {
      const b64 = q.liqB64.replace(/-/g, "+").replace(/_/g, "/");
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      const txt = Buffer.from(b64 + pad, "base64").toString("utf8");
      const j = JSON.parse(txt);
      if (Array.isArray(j)) return j;
    } catch {}
  }

  return null;
}

export default async function handler(req, res) {
  try {
    const tf = String(req.query?.tf || "1d").toLowerCase();
    const includeLive = String(req.query?.includeLive || "0") === "1";

    const hRaw = Number(req.query?.h || 90);
    const horizonBars = Number.isFinite(hRaw) ? Math.max(1, Math.min(hRaw, 180)) : 90;

    let candlesTruth, candlesWithLive, hasLive, intervalLabel;

    // ✅ altijd weekly ophalen voor alignment bij 1d
    let weeklyTruthCandles = null;

    if (tf === "1w") {
      ({ candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth, candlesWithLive, hasLive } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";

      const w = await getWeeklyBtcCandlesKraken();
      weeklyTruthCandles = w?.candlesTruth ?? null;
    }

    const candles = includeLive ? candlesWithLive : candlesTruth;

    // ✅ funding + liq inputs (optioneel)
    const fundingNow = Number(req.query?.funding);
    const fundingVal = Number.isFinite(fundingNow) ? fundingNow : null;

    const liqLevels = parseLiqFromQuery(req.query);

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive,
      tf: intervalLabel,
      horizonBars,
      weeklyTruthCandles,

      fundingNow: fundingVal,
      liqLevels: liqLevels
    });

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      source: "kraken",
      interval: intervalLabel,
      truthCount: candlesTruth.length,
      hasLive,
      horizonBars,

      // inputs echo (handig debug)
      fundingNow: fundingVal,
      liqLevelsCount: Array.isArray(liqLevels) ? liqLevels.length : 0,

      candles: candles.map(c => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? null
      })),

      forestOverlayTruth: out.forestOverlayTruth,
      forestOverlayLive: out.forestOverlayLive,

      forestOverlayForwardMid: out.forestOverlayForwardMid,
      forestOverlayForwardUpper: out.forestOverlayForwardUpper,
      forestOverlayForwardLower: out.forestOverlayForwardLower,

      forestZTruth: out.forestZTruth,
      forestZLive: out.forestZLive,
      nowPoint: out.nowPoint,

      bandsNow: out.bandsNow,
      freezeNow: out.freezeNow,
      regimeLabel: out.regimeLabel,

      confidence: out.confidence,
      stabilityScore: out.stabilityScore,
      regimeFlipProbability: out.regimeFlipProbability
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}