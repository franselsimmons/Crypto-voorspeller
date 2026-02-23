function $(id){ return document.getElementById(id); }
function setPill(text){ $("statusPill").textContent = text; }

async function loadData(){
  const r = await fetch("/api/forest?includeLive=1", { headers: { accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(text || "API failed");
  return JSON.parse(text);
}

function makeChart(el, { height }) {
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height,
    layout: { background: { color: "#0e1117" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "#222" }, horzLines: { color: "#222" } },
    rightPriceScale: { borderColor: "#222" },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 }
  });
}

function last(arr){
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
}

function buildZForwardFromTruth(zTruthSeries, weeksForward = 4){
  // zTruthSeries: [{time, value}, ...]
  const n = zTruthSeries?.length || 0;
  if (n < 6) return [];

  const p0 = zTruthSeries[n - 1];
  const p1 = zTruthSeries[n - 2];
  const p2 = zTruthSeries[n - 3];
  if (!p0 || !p1 || !p2) return [];

  const lastZ = p0.value;
  const slope = (p0.value - p2.value) / 2; // per week gemiddeld (ruw)
  const slopeCap = 0.6;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const slopeCapped = clamp(slope, -slopeCap, slopeCap);

  const damp = 1 - Math.min(Math.abs(lastZ) / 3, 1);
  const step = slopeCapped * (0.35 + 0.65 * damp);

  const weekSec = 7 * 24 * 60 * 60;
  const out = [{ time: p0.time, value: p0.value }];

  for (let k = 1; k <= weeksForward; k++) {
    const zF = clamp(lastZ + step * k, -2.5, 2.5);
    out.push({ time: p0.time + weekSec * k, value: zF });
  }
  return out;
}

async function init(){
  setPill("Loading…");
  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth weeks: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"}`;

  $("debug").textContent = JSON.stringify({
    freezeNow: data.freezeNow,
    bandsNow: data.bandsNow
  }, null, 2);

  // -------- PRICE CHART --------
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  // Truth overlay (VERLEDEN) — blauw solid
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    color: "#2aa1ff"
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  // Live overlay (NU preview) — lichtblauw dashed
  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    color: "#7fc8ff"
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  // Forward (TOEKOMST hint) — grijs/wit dashed dun
  const forestFwd = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    color: "#cfd3da"
  });
  if (data.forestOverlayForward?.length) forestFwd.setData(data.forestOverlayForward);

  // NU marker op prijs-forest: laatste truth punt
  const lastTruthOverlay = last(data.forestOverlayTruth);
  if (lastTruthOverlay){
    forestTruth.setMarkers([{
      time: lastTruthOverlay.time,
      position: "inBar",
      shape: "circle",
      text: "NOW"
    }]);
  }

  priceChart.timeScale().fitContent();

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  forestChart.priceScale("right").applyOptions({
    autoScale: true,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  // z truth — blauw solid
  const zTruth = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    color: "#2aa1ff"
  });
  zTruth.setData(data.forestZTruth || []);

  // z live — lichtblauw dashed
  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    color: "#7fc8ff"
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // z forward (4 weken) — grijs dashed
  const zFwd = forestChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    color: "#cfd3da"
  });
  const zForwardSeries = buildZForwardFromTruth(data.forestZTruth || [], 4);
  if (zForwardSeries.length) zFwd.setData(zForwardSeries);

  // NU marker op z-score: laatste truth punt
  const lastZ = last(data.forestZTruth);
  if (lastZ){
    zTruth.setMarkers([{
      time: lastZ.time,
      position: "inBar",
      shape: "circle",
      text: "NOW Z"
    }]);
  }

  forestChart.timeScale().fitContent();

  setPill(data.regimeLabel);

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});