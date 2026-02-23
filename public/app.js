function $(id){ return document.getElementById(id); }
function setPill(text){ $("statusPill").textContent = text; }

let state = { tf: "1d", h: 90 };

function setActiveButtons(){
  ["tf1d","tf1w"].forEach(id => $(id).classList.remove("active"));
  ["h30","h60","h90","h180"].forEach(id => $(id).classList.remove("active"));
  $(state.tf === "1w" ? "tf1w" : "tf1d").classList.add("active");
  $(`h${state.h}`).classList.add("active");
}

async function loadData(){
  const url = `/api/forest?tf=${encodeURIComponent(state.tf)}&h=${encodeURIComponent(state.h)}&includeLive=1`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(text || "API failed");
  return JSON.parse(text);
}

function makeChart(el, { height }) {
  const h = Math.max(240, Number(height || 0) || el.clientHeight || 0, 340);
  const w = Math.max(320, el.clientWidth || 0);

  return LightweightCharts.createChart(el, {
    width: w,
    height: h,
    layout: { background: { color: "#0e1117" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "#222" }, horzLines: { color: "#222" } },
    rightPriceScale: { borderColor: "#222" },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false, rightOffset: 10 },
    crosshair: { mode: 1 },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, pinch: true, mouseWheel: true }
  });
}

function destroyChildCharts(){
  $("priceChart").innerHTML = "";
  $("forestChart").innerHTML = "";
}

function wireButtons(){
  $("tf1d").onclick = async () => { state.tf = "1d"; setActiveButtons(); await init(); };
  $("tf1w").onclick = async () => { state.tf = "1w"; setActiveButtons(); await init(); };

  $("h30").onclick  = async () => { state.h = 30;  setActiveButtons(); await init(); };
  $("h60").onclick  = async () => { state.h = 60;  setActiveButtons(); await init(); };
  $("h90").onclick  = async () => { state.h = 90;  setActiveButtons(); await init(); };
  $("h180").onclick = async () => { state.h = 180; setActiveButtons(); await init(); };
}

async function init(){
  setPill("Loading…");
  destroyChildCharts();

  const data = await loadData();

  const biggest = `${data.regimeNow} (${data.confidence})`;
  setPill(`Grootste kans: ${biggest}`);

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Forward: ${data.horizonBars}`;

  $("debug").textContent = JSON.stringify({
    regimeNow: data.regimeNow,
    confidence: data.confidence,
    freezeNow: data.freezeNow,
    bandsNow: data.bandsNow,
    nowPoint: data.nowPoint
  }, null, 2);

  // -------- PRICE CHART --------
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  const forestTruth = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  forestTruth.setData(data.forestOverlayTruth || []);

  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  // Fan bands (upper/lower)
  const fUpper = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  const fLower = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  if (data.forestOverlayForwardUpper?.length) fUpper.setData(data.forestOverlayForwardUpper);
  if (data.forestOverlayForwardLower?.length) fLower.setData(data.forestOverlayForwardLower);

  // Forward MID in 4 stukken (4 kleuren)
  const f1 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#ffd166" });
  const f2 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#f8961e" });
  const f3 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#f94144" });
  const f4 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#90caf9" });

  if (data.forestForward4?.a?.length) f1.setData(data.forestForward4.a);
  if (data.forestForward4?.b?.length) f2.setData(data.forestForward4.b);
  if (data.forestForward4?.c?.length) f3.setData(data.forestForward4.c);
  if (data.forestForward4?.d?.length) f4.setData(data.forestForward4.d);

  // NOW marker op overlay
  if (data.nowPoint?.time && data.nowPoint?.overlay != null) {
    forestTruth.setMarkers([{
      time: data.nowPoint.time,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW"
    }]);
  }

  priceChart.timeScale().fitContent();

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  const zTruth = forestChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  zTruth.setData(data.forestZTruth || []);

  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // NOW Z marker
  if (data.nowPoint?.time && data.nowPoint?.z != null) {
    zTruth.setMarkers([{
      time: data.nowPoint.time,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW Z"
    }]);
  }

  forestChart.timeScale().fitContent();

  // Sync zoom/scroll (zodat boven+onder samen bewegen)
  let syncing = false;

  priceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (syncing || !range) return;
    syncing = true;
    forestChart.timeScale().setVisibleRange(range);
    syncing = false;
  });

  forestChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (syncing || !range) return;
    syncing = true;
    priceChart.timeScale().setVisibleRange(range);
    syncing = false;
  });

  // resize
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

wireButtons();
setActiveButtons();

init().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});