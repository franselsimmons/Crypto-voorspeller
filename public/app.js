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
    crosshair: { mode: 1 },

    // ✅ iPhone / normaal zoomen & slepen
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true
    }
  });
}

function lastPoint(arr){
  return (arr && arr.length) ? arr[arr.length - 1] : null;
}

function addNowMarker(series, point, label){
  if (!point) return;
  series.setMarkers([{
    time: point.time,
    position: "inBar",
    color: "#ffffff",
    shape: "circle",
    text: label || "NOW"
  }]);
}

// ✅ Sync alleen VAN boven -> onder (geen terugkoppeling = normaal zoomen)
function syncTimeOneWay(masterChart, followerChart){
  let raf = 0;
  masterChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (!range) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      followerChart.timeScale().setVisibleLogicalRange(range);
      raf = 0;
    });
  });
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
  // ✅ BELANGRIJK voor iPhone: anders vecht Safari met je pinch/drag
  priceEl.style.touchAction = "none";

  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  const forestTruth = priceChart.addLineSeries({
    lineWidth: 3,
    priceLineVisible: false,
    color: "rgba(46,163,255,1)"
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    color: "rgba(127,211,255,0.95)"
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  const forestFwd = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    color: "rgba(255,255,255,0.75)"
  });
  forestFwd.setData(data.forestOverlayForward || []);

  const nowOverlay = lastPoint(data.forestOverlayTruth || []);
  addNowMarker(forestTruth, nowOverlay, "NOW");

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  forestEl.style.touchAction = "none";

  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  forestChart.priceScale("right").applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  const zTruth = forestChart.addLineSeries({
    lineWidth: 3,
    priceLineVisible: false,
    color: "rgba(46,163,255,1)"
  });
  zTruth.setData(data.forestZTruth || []);

  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    color: "rgba(127,211,255,0.95)"
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  const nowZ = lastPoint(data.forestZTruth || []);
  addNowMarker(zTruth, nowZ, "NOW Z");

  // ✅ Start netjes
  priceChart.timeScale().fitContent();
  forestChart.timeScale().fitContent();

  // ✅ Normaal zoomen boven, onder volgt
  syncTimeOneWay(priceChart, forestChart);

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