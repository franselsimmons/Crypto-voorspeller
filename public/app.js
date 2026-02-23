function $(id){ return document.getElementById(id); }
function setPill(text){ $("statusPill").textContent = text; }

let state = {
  tf: "1d",
  h: 90,
  firstRender: true
};

function setActiveButtons(){
  $("btnTf1d").classList.toggle("active", state.tf === "1d");
  $("btnTf1w").classList.toggle("active", state.tf === "1w");

  document.querySelectorAll('button.btn[data-h]').forEach(b=>{
    b.classList.toggle("active", Number(b.dataset.h) === state.h);
  });
}

async function loadData(){
  const url = `/api/forest?tf=${encodeURIComponent(state.tf)}&h=${encodeURIComponent(state.h)}&includeLive=1`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
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
    timeScale: {
      borderColor: "#222",
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8
    },
    crosshair: { mode: 1 },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, pinch: true, mouseWheel: true }
  });
}

function splitForecastIntoWeeks(points, tf){
  // points bevat [now + horizon]
  const barsPerWeek = (tf === "1w") ? 1 : 7;

  // neem alleen forward (zonder eerste "now" punt) voor segmenten
  const forward = points.slice(1);

  const week1 = forward.slice(0, 1 * barsPerWeek);
  const week2 = forward.slice(1 * barsPerWeek, 2 * barsPerWeek);
  const week3 = forward.slice(2 * barsPerWeek, 3 * barsPerWeek);
  const week4 = forward.slice(3 * barsPerWeek, 4 * barsPerWeek);
  const rest  = forward.slice(4 * barsPerWeek);

  // we willen dat elke weekserie netjes aansluit:
  // start elk segment met het vorige eindpunt
  function withJoin(prevEnd, seg){
    if (!seg.length) return [];
    return prevEnd ? [prevEnd, ...seg] : seg;
  }

  const now = points[0] || null;
  const w1 = withJoin(now, week1);

  const end1 = w1.length ? w1[w1.length - 1] : now;
  const w2 = withJoin(end1, week2);

  const end2 = w2.length ? w2[w2.length - 1] : end1;
  const w3 = withJoin(end2, week3);

  const end3 = w3.length ? w3[w3.length - 1] : end2;
  const w4 = withJoin(end3, week4);

  const end4 = w4.length ? w4[w4.length - 1] : end3;
  const r  = withJoin(end4, rest);

  return { w1, w2, w3, w4, rest: r };
}

let priceChart, forestChart;
let series = {};

function clearSeries(){
  if (!priceChart || !forestChart) return;

  Object.values(series).forEach(s=>{
    try { priceChart.removeSeries(s); } catch {}
    try { forestChart.removeSeries(s); } catch {}
  });
  series = {};
}

function setVisibleRangeNice(chart, candles, tf, horizonBars){
  if (!candles?.length) return;

  const stepSec = (tf === "1w") ? 7 * 24 * 60 * 60 : 24 * 60 * 60;

  const n = candles.length;
  const fromIdx = Math.max(0, n - 220); // “normale zoom”
  const from = candles[fromIdx].time;

  const lastTime = candles[n - 1].time;
  const to = lastTime + stepSec * (horizonBars + 5);

  chart.timeScale().setVisibleRange({ from, to });
}

async function render(){
  setActiveButtons();
  setPill("Loading…");

  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Forward: ${data.horizonBars}`;

  $("debug").textContent = JSON.stringify({
    regimeNow: data.regimeNow,
    confidence: data.confidence,
    freezeNow: data.freezeNow,
    bandsNow: data.bandsNow,
    nowPoint: data.nowPoint
  }, null, 2);

  clearSeries();

  // -------- PRICE CHART --------
  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  // Forest overlay truth
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 3,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth || []);
  series.forestTruth = forestTruth;

  // Forest overlay live
  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);
  series.forestLive = forestLive;

  // Forecast fan (upper/lower)
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
  series.fUpper = fUpper;
  series.fLower = fLower;

  // Forecast mid in 4 week-kleuren
  const mid = data.forestOverlayForwardMid || [];
  const parts = splitForecastIntoWeeks(mid, data.interval);

  const w1 = priceChart.addLineSeries({ lineWidth: 3, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  const w2 = priceChart.addLineSeries({ lineWidth: 3, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  const w3 = priceChart.addLineSeries({ lineWidth: 3, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  const w4 = priceChart.addLineSeries({ lineWidth: 3, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });

  // kleuren: (bewust 4 duidelijk verschillende)
  w1.applyOptions({ color: "#ffd166" }); // week 1
  w2.applyOptions({ color: "#f77f00" }); // week 2
  w3.applyOptions({ color: "#ef233c" }); // week 3
  w4.applyOptions({ color: "#8d99ae" }); // week 4 (meer “mist”)

  if (parts.w1.length) w1.setData(parts.w1);
  if (parts.w2.length) w2.setData(parts.w2);
  if (parts.w3.length) w3.setData(parts.w3);
  if (parts.w4.length) w4.setData(parts.w4);

  series.w1 = w1; series.w2 = w2; series.w3 = w3; series.w4 = w4;

  // “NOW” marker op prijs: use overlay value (duidelijk)
  if (data.nowPoint?.time && data.nowPoint?.overlay != null) {
    forestTruth.setMarkers([{
      time: data.nowPoint.time,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW"
    }]);
  }

  // normale zoom + future zichtbaar zonder dat hij alles mini maakt
  setVisibleRangeNice(priceChart, data.candles, data.interval, data.horizonBars);

  // -------- Z CHART --------
  const zTruth = forestChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  zTruth.setData(data.forestZTruth || []);
  series.zTruth = zTruth;

  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);
  series.zLive = zLive;

  // NOW marker op Z
  if (data.nowPoint?.time && data.nowPoint?.z != null) {
    zTruth.setMarkers([{
      time: data.nowPoint.time,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW Z"
    }]);
  }

  // Z paneel: laat ‘m autoscale, maar niet gek
  forestChart.priceScale("right").applyOptions({
    autoScale: true,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  setVisibleRangeNice(forestChart, data.candles, data.interval, data.horizonBars);

  // pill tekst
  const kans = `${data.regimeNow} (${data.confidence})`;
  setPill(`Grootste kans: ${kans}`);

  // resize
  const priceEl = $("priceChart");
  const forestEl = $("forestChart");
  priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
  forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
}

async function init(){
  const priceEl = $("priceChart");
  const forestEl = $("forestChart");
  priceChart = makeChart(priceEl, { height: priceEl.clientHeight });
  forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  // buttons
  $("btnTf1d").addEventListener("click", () => { state.tf = "1d"; render().catch(showErr); });
  $("btnTf1w").addEventListener("click", () => { state.tf = "1w"; render().catch(showErr); });

  document.querySelectorAll('button.btn[data-h]').forEach(b=>{
    b.addEventListener("click", ()=>{
      state.h = Number(b.dataset.h);
      render().catch(showErr);
    });
  });

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });

  await render();
}

function showErr(err){
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
}

init().catch(showErr);