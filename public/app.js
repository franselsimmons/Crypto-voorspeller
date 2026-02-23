function $(id){ return document.getElementById(id); }
function setPill(text){ $("statusPill").textContent = text; }

let state = { tf: "1d", h: 90 };

function setActiveButtons() {
  document.querySelectorAll(".btn[data-tf]").forEach(b => {
    b.classList.toggle("active", b.dataset.tf === state.tf);
  });
  document.querySelectorAll(".btn[data-h]").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.h) === state.h);
  });
}

async function loadData(){
  const url = `/api/forest?includeLive=1&tf=${encodeURIComponent(state.tf)}&h=${encodeURIComponent(state.h)}`;
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
    rightPriceScale: { borderColor: "#222", autoScale: true },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
      mouseWheel: true,
      pinch: true
    },
    crosshair: { mode: 1 }
  });
}

function isNum(x){ return typeof x === "number" && Number.isFinite(x); }
function cleanLine(points){
  return (points || []).filter(p => p && isNum(p.time) && isNum(p.value));
}
function cleanCandles(c){
  return (c || []).filter(x =>
    x && isNum(x.time) && isNum(x.open) && isNum(x.high) && isNum(x.low) && isNum(x.close)
  );
}

function chunkInto4(points) {
  if (!points || points.length < 2) return [[],[],[],[]];
  const n = points.length;
  const cut1 = Math.floor(n * 0.25);
  const cut2 = Math.floor(n * 0.50);
  const cut3 = Math.floor(n * 0.75);
  const s1 = points.slice(0, cut1 + 1);
  const s2 = points.slice(cut1, cut2 + 1);
  const s3 = points.slice(cut2, cut3 + 1);
  const s4 = points.slice(cut3);
  return [s1, s2, s3, s4];
}

let priceChart = null;
let forestChart = null;

function destroyChart(el, chart){
  try { chart?.remove?.(); } catch {}
  el.innerHTML = "";
}

async function render(){
  setActiveButtons();
  setPill("Loading…");

  const data = await loadData();

  const conf = data.confidence || "low";
  const reg = data.regimeNow || "NEUTRAL";
  const zNow = data?.nowPoint?.z;
  const zTxt = (typeof zNow === "number") ? zNow.toFixed(2) : "n/a";

  $("bigChance").textContent = `Grootste kans: ${reg} (${conf})`;

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Forward: ${data.horizonBars}`;

  $("debug").textContent = JSON.stringify({
    regimeNow: data.regimeNow,
    confidence: data.confidence,
    freezeNow: data.freezeNow,
    bandsNow: data.bandsNow,
    nowPoint: data.nowPoint
  }, null, 2);

  // ----- PRICE CHART (rebuild) -----
  const priceEl = $("priceChart");
  destroyChart(priceEl, priceChart);
  priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(cleanCandles(data.candles));

  const forestTruth = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  forestTruth.setData(cleanLine(data.forestOverlayTruth));

  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  forestLive.setData(cleanLine(data.forestOverlayLive));

  const fUpper = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  fUpper.setData(cleanLine(data.forestOverlayForwardUpper));

  const fLower = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  fLower.setData(cleanLine(data.forestOverlayForwardLower));

  const mid = cleanLine(data.forestOverlayForwardMid);
  const [m1, m2, m3, m4] = chunkInto4(mid);

  const f1 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  f1.applyOptions({ color: "#fbbf24" });
  const f2 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  f2.applyOptions({ color: "#fb923c" });
  const f3 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  f3.applyOptions({ color: "#ef4444" });
  const f4 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  f4.applyOptions({ color: "#a78bfa" });

  f1.setData(m1);
  f2.setData(m2);
  f3.setData(m3);
  f4.setData(m4);

  const nowTime = data?.nowPoint?.time;
  if (isNum(nowTime)) {
    candles.setMarkers([{
      time: nowTime,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW"
    }]);
  }

  priceChart.timeScale().fitContent();

  // ----- Z CHART (rebuild) -----
  const forestEl = $("forestChart");
  destroyChart(forestEl, forestChart);
  forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  const zTruth = forestChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  zTruth.setData(cleanLine(data.forestZTruth));

  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  zLive.setData(cleanLine(data.forestZLive));

  if (isNum(nowTime)) {
    zTruth.setMarkers([{
      time: nowTime,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: `NOW Z ${zTxt}`
    }]);
  }

  forestChart.timeScale().fitContent();

  setPill(data.regimeLabel);

  window.onresize = () => render().catch(console.error);
}

function wireUI() {
  document.querySelectorAll(".btn[data-tf]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tf = btn.dataset.tf;
      render().catch(console.error);
    });
  });
  document.querySelectorAll(".btn[data-h]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.h = Number(btn.dataset.h);
      render().catch(console.error);
    });
  });

  state.tf = "1d";
  state.h = 90;
  setActiveButtons();
}

wireUI();
render().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});