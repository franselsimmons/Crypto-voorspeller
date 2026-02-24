// api/_lib/kraken.js
const KRAKEN_OHLC = "https://api.kraken.com/0/public/OHLC";
const PAIR = "XBTUSD";

function toCandle(row) {
  return {
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6])
  };
}

async function fetchOhlc({ intervalMinutes }) {
  const url = `${KRAKEN_OHLC}?pair=${PAIR}&interval=${intervalMinutes}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Kraken OHLC failed: ${r.status}`);
  const j = await r.json();
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const result = j.result || {};
  const pairKey = Object.keys(result).find((k) => k !== "last");
  if (!pairKey) throw new Error("Kraken: no result pair key");

  const rows = result[pairKey] || [];
  return rows.map(toCandle).sort((a, b) => a.time - b.time);
}

function splitTruthAndLive(candles, intervalSec) {
  if (!candles.length) return { candlesTruth: [], candlesWithLive: [], hasLive: false };
  const last = candles[candles.length - 1];
  const nowSec = Math.floor(Date.now() / 1000);
  const isLive = nowSec < (last.time + intervalSec);
  return {
    candlesTruth: isLive ? candles.slice(0, -1) : candles.slice(),
    candlesWithLive: candles.slice(),
    hasLive: isLive
  };
}

export async function getWeeklyBtcCandlesKraken() {
  const intervalMinutes = 10080;
  const intervalSec = intervalMinutes * 60;
  const candles = await fetchOhlc({ intervalMinutes });
  return splitTruthAndLive(candles, intervalSec);
}

export async function getDailyBtcCandlesKraken() {
  const intervalMinutes = 1440;
  const intervalSec = intervalMinutes * 60;
  const candles = await fetchOhlc({ intervalMinutes });
  return splitTruthAndLive(candles, intervalSec);
}