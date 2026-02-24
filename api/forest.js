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

    // We halen altijd weekly op als tf=1d, zodat daily en weekly kunnen “alignen”
    let weeklyTruthCandles = null;

    let candlesTruth, candlesWithLive, hasLive, intervalLabel;

    if (tf === "1w") {
      ({ candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth, candlesWithLive, hasLive } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";

      const w = await getWeeklyBtcCandlesKraken();
      weeklyTruthCandles = w.candlesTruth;
    }

    const candles = includeLive ? candlesWithLive : candlesTruth;

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive,
      tf: intervalLabel,
      horizonBars,
      weeklyTruthCandles
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
        close: c.close,
        volume: c.volume ?? 0
      })),

      // overlay op prijs-chart
      forestOverlayTruth: out.forestOverlayTruth,
      forestOverlayLive: out.forestOverlayLive,

      // forward (mid) + fan bands
      forestOverlayForwardMid: out.forestOverlayForwardMid,
      forestOverlayForwardUpper: out.forestOverlayForwardUpper,
      forestOverlayForwardLower: out.forestOverlayForwardLower,

      // z-score paneel
      forestZTruth: out.forestZTruth,
      forestZLive: out.forestZLive,
      nowPoint: out.nowPoint,

      // nieuw: regime/confirm/magnets/kalibratie
      regimeHard: out.regimeHard,
      trendState: out.trendState,
      ema200Weekly: out.ema200Weekly,
      confirmations: out.confirmations,
      srLevels: out.srLevels,
      magnets: out.magnets,
      calibration: out.calibration,

      // debug
      bandsNow: out.bandsNow,
      freezeNow: out.freezeNow,
      regimeLabel: out.regimeLabel
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}