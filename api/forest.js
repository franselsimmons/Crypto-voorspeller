// api/forest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const tf = String(req.query?.tf || "1d").toLowerCase();
    const includeLive = String(req.query?.includeLive || "0") === "1";

    const hRaw = Number(req.query?.h || 90);
    const horizonBars = Number.isFinite(hRaw) ? Math.max(1, Math.min(hRaw, 180)) : 90;

    let candlesTruth, candlesWithLive, hasLive, intervalLabel;

    // Extra: weekly context voor daily (EMA200 bias)
    let weeklyTruthForBias = null;

    if (tf === "1w") {
      ({ candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth, candlesWithLive, hasLive } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";

      const wk = await getWeeklyBtcCandlesKraken();
      weeklyTruthForBias = wk.candlesTruth;
    }

    const candles = includeLive ? candlesWithLive : candlesTruth;

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive,
      tf: intervalLabel,
      horizonBars,
      weeklyTruthForBias
    });

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      source: "kraken",
      interval: intervalLabel,
      truthCount: candlesTruth.length,
      hasLive,
      horizonBars,

      candles: candles.map(c => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      })),

      forestOverlayTruth: out.forestOverlayTruth,
      forestOverlayLive: out.forestOverlayLive,

      forestOverlayForwardMid: out.forestOverlayForwardMid,
      forestOverlayForwardUpper: out.forestOverlayForwardUpper,
      forestOverlayForwardLower: out.forestOverlayForwardLower,

      // 4 kleuren (mid)
      forestOverlayForwardMidW1: out.forestOverlayForwardMidW1,
      forestOverlayForwardMidW2: out.forestOverlayForwardMidW2,
      forestOverlayForwardMidW3: out.forestOverlayForwardMidW3,
      forestOverlayForwardMidW4: out.forestOverlayForwardMidW4,

      forestZTruth: out.forestZTruth,
      forestZLive: out.forestZLive,
      nowPoint: out.nowPoint,

      bandsNow: out.bandsNow,
      freezeNow: out.freezeNow,
      regimeLabel: out.regimeLabel,

      biggestChance: out.biggestChance,
      confidence: out.confidence,
      adxNow: out.adxNow,
      weeklyBias: out.weeklyBias
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}