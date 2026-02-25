// api/_lib/kraken.js
// Kraken OHLC -> candles { time, open, high, low, close, volume }
//
// Kraken OHLC interval is MINUTES:
// 1d = 1440
// 1w = 10080
//
// Pair voor BTC/USD: XBTUSD (meestal) - als jouw account iets anders wil: pas PAIR aan.

const PAIR = "XBTUSD";

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function fetchKrakenOHLC(intervalMinutes, since = 0) {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${PAIR}&interval=${intervalMinutes}${since ? `&since=${since}` : ""}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Kraken OHLC fetch failed: ${r.status}`);
  const j = await r.json();

  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);
  const result = j?.result;
  if (!result) throw new Error("Kraken OHLC missing result");

  const key = Object.keys(result).find(k => k !== "last");
  const rows = result[key];
  const last = result.last;

  if (!Array.isArray(rows)) throw new Error("Kraken OHLC rows not array");

  const candles = rows.map(row => {
    // [time, open, high, low, close, vwap, volume, count]
    const t = toNum(row?.[0]);
    return {
      time: t != null ? t : null, // seconds epoch
      open: toNum(row?.[1]),
      high: toNum(row?.[2]),
      low: toNum(row?.[3]),
      close: toNum(row?.[4]),
      volume: toNum(row?.[6])
    };
  }).filter(c =>
    c.time != null &&
    c.open != null && c.high != null && c.low != null && c.close != null
  );

  return { candles, last };
}

// “Truth” = gesloten candles.
// “Live” = laatste candle kan nog aan het vormen zijn (Kraken geeft hem soms mee).
function splitTruthLive(candles) {
  if (!candles.length) return { candlesTruth: [], candlesWithLive: [], hasLive: false };

  // laatste candle nemen als live (veilig)
  const candlesTruth = candles.slice(0, -1);
  const candlesWithLive = candles.slice();
  return { candlesTruth, candlesWithLive, hasLive: true };
}

export async function getDailyBtcCandlesKraken() {
  // Kraken geeft max ~720 candles vaak prima zonder since; als je meer wil: pagineren.
  const { candles } = await fetchKrakenOHLC(1440, 0);
  return splitTruthLive(candles);
}

export async function getWeeklyBtcCandlesKraken() {
  const { candles } = await fetchKrakenOHLC(10080, 0);
  return splitTruthLive(candles);
}