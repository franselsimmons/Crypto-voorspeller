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

function lastItem(arr){ return (arr && arr.length) ? arr[arr.length - 1] : null; }

function buildLiveSegment(truthArr, liveArr){
  if (!truthArr?.length || !liveArr?.length) return [];
  const tLast = lastItem(truthArr);
  const lLast = lastItem(liveArr);
  if (!tLast?.time || !lLast?.time) return [];
  if (tLast.time === lLast.time) return [];
  return [tLast, lLast];
}

function addNowMarker(series, time, text){
  if (!series || !time) return;
  series.setMarkers([{
    time,
    position: "inBar",
    shape: "circle",
    color: "#ffffff",
    text
  }]);
}

function syncTimeScales(chartA, chartB){
  let isSyncing = false;
  chartA.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (isSyncing || !range) return;
    isSyncing = true;
    chartB.timeScale().setVisibleRange(range);
    isSyncing = false;
  });
  chartB.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (isSyncing || !range) return;
    isSyncing = true;
    chartA.timeScale().setVisibleRange(range);
    isSyncing = false;
  });
}

async function init(){
  setPill("Loading…");
  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth weeks: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"}`;

  $("debug").textContent = JSON.stringify({
    bandsNow: data.bandsNow,
    freezeNow: data.freezeNow,
    uitleg: {
      solid: "TRUTH (gesloten weeks)",
      dashed: "LIVE preview (lopende week)",
      dashedThin: "FORWARD hint (4w vooruit)",
      dotted: "DAILY route naar next weekly target (visualisatie)"
    }
  }, null, 2);

  // -------- PRICE CHART --------
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles || []);

  // Truth overlay (solid)
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  // Live overlay (dashed) -> alleen stukje
  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  const liveOverlaySegment = buildLiveSegment(data.forestOverlayTruth, data.forestOverlayLive);
  if (liveOverlaySegment.length) forestLive.setData(liveOverlaySegment);

  // Forward (dashed thin)
  const forestFwd = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayForward?.length) forestFwd.setData(data.forestOverlayForward);

  // DAILY route naar next week target (extra dun dotted style)
  const dailyRoute = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  if (data.dailyRouteToNextWeek?.length) dailyRoute.setData(data.dailyRouteToNextWeek);

  // NOW marker op laatste candle
  addNowMarker(candles, lastItem(data.candles)?.time, "NOW");

  priceChart.timeScale().fitContent();

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  forestChart.priceScale("right").applyOptions({
    autoScale: true,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  const zTruth = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  zTruth.setData(data.forestZTruth || []);

  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  const liveZSegment = buildLiveSegment(data.forestZTruth, data.forestZLive);
  if (liveZSegment.length) zLive.setData(liveZSegment);

  // NOW Z marker
  const zNowPoint = lastItem((data.forestZLive && data.forestZLive.length) ? data.forestZLive : data.forestZTruth);
  const zTargetSeries = (data.forestZLive && data.forestZLive.length) ? zLive : zTruth;
  addNowMarker(zTargetSeries, zNowPoint?.time, "NOW Z");

  forestChart.timeScale().fitContent();

  // Sync scroll/zoom
  syncTimeScales(priceChart, forestChart);

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