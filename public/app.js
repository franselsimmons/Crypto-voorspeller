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

function lastItem(arr){
  return (arr && arr.length) ? arr[arr.length - 1] : null;
}

function addNowMarkerToSeries(series, time, text){
  if (!series || !time) return;
  series.setMarkers([{
    time,
    position: "inBar",
    shape: "circle",
    color: "#ffffff",
    text
  }]);
}

function addNowLineToChart(chart, time, label){
  // optioneel: verticale “NOW” lijn (subtiel)
  if (!chart || !time) return;

  // Lightweight-charts heeft geen native "vertical line" primitive zonder plugins,
  // dus we doen het via een onzichtbare lineSeries met 2 punten die een verticale illusie geeft niet goed.
  // Daarom: we houden het bij markers (duidelijk + stabiel).
  // (Laat deze functie staan voor later uitbreiden.)
}

function syncTimeScales(chartA, chartB){
  // Zorgt dat scroll/zoom 1-op-1 meeloopt tussen charts
  let isSyncing = false;

  chartA.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (isSyncing) return;
    isSyncing = true;
    chartB.timeScale().setVisibleRange(range);
    isSyncing = false;
  });

  chartB.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (isSyncing) return;
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

  // Debug (veilig: werkt ook als velden niet bestaan)
  $("debug").textContent = JSON.stringify({
    freezeNow: data.freezeNow,
    bandsNow: data.bandsNow
  }, null, 2);

  // -------- PRICE CHART --------
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candleSeries = priceChart.addCandlestickSeries();
  candleSeries.setData(data.candles || []);

  // Forest overlay TRUTH (solid)
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  // Forest overlay LIVE (dashed)
  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  // Forest forward (dashed thin)
  const forestFwd = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayForward?.length) forestFwd.setData(data.forestOverlayForward);

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  // (Let op) autoScale false zonder vaste min/max werkt “half”.
  // We houden autoScale aan, maar je ziet nu exact waar “NOW Z” zit.
  forestChart.priceScale("right").applyOptions({
    autoScale: true,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  // z truth
  const zTruth = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  zTruth.setData(data.forestZTruth || []);

  // z live preview
  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // -------- NOW markers --------
  // “NOW” op laatste candle (de tijd-as moet exact overeenkomen)
  const lastCandle = lastItem(data.candles);
  const nowTime = lastCandle?.time;

  // Marker bovenin op candle serie (duidelijk waar je bent)
  addNowMarkerToSeries(candleSeries, nowTime, "NOW");

  // Marker onderin op z series:
  // Als er live z is, pak die laatste, anders truth laatste.
  const zNowPoint = lastItem((data.forestZLive && data.forestZLive.length) ? data.forestZLive : data.forestZTruth);
  const zNowTime = zNowPoint?.time;

  // Plaats marker op de juiste z-serie (live als die er is, anders truth)
  const zTargetSeries = (data.forestZLive && data.forestZLive.length) ? zLive : zTruth;
  addNowMarkerToSeries(zTargetSeries, zNowTime, "NOW Z");

  // -------- Fit & sync --------
  priceChart.timeScale().fitContent();
  forestChart.timeScale().fitContent();

  // Nu: charts 1-op-1 samen laten bewegen
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