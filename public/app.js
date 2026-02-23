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

function chunkInto4(points) {
  if (!points || points.length < 2) return [[],[],[],[]];
  const n = points.length;
  const cut1 = Math.floor(n * 0.25);
  const cut2 = Math.floor(n * 0.50);
  const cut3 = Math.floor(n * 0.75);

  // Zorg dat elk segment netjes aansluit (dupliceer overgangspunt)
  const s1 = points.slice(0, cut1 + 1);
  const s2 = points.slice(cut1, cut2 + 1);
  const s3 = points.slice(cut2, cut3 + 1);
  const s4 = points.slice(cut3);
  return [s1, s2, s3, s4];
}

let priceChart = null;
let forestChart = null;

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

  // ---------- PRICE CHART ----------
  const priceEl = $("priceChart");
  if (!priceChart) priceChart = makeChart(priceEl, { height: priceEl.clientHeight });
  else priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });

  priceChart.removeSeries?.(); // sommige builds hebben dit niet, daarom hieronder safe reset
  // safe reset: nieuwe chart als removeSeries niet bestaat
  if (typeof priceChart.removeSeries !== "function") {
    priceEl.innerHTML = "";
    priceChart = makeChart(priceEl, { height: priceEl.clientHeight });
  } else {
    // remove all series
    const series = priceChart._private__serieses || [];
    for (const s of series) { try { priceChart.removeSeries(s); } catch {} }
  }

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  const forestTruth = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  // Forward bands (upper/lower) dotted
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

  // Forward MID in 4 kleuren (week/segment 1/2/3/4)
  const mid = data.forestOverlayForwardMid || [];
  const [m1, m2, m3, m4] = chunkInto4(mid);

  const f1 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#fbbf24" });
  const f2 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#fb923c" });
  const f3 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#ef4444" });
  const f4 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#a78bfa" });

  if (m1.length) f1.setData(m1);
  if (m2.length) f2.setData(m2);
  if (m3.length) f3.setData(m3);
  if (m4.length) f4.setData(m4);

  // NOW marker (op de candles serie)
  const nowTime = data?.nowPoint?.time;
  if (nowTime) {
    candles.setMarkers([{
      time: nowTime,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW"
    }]);
  }

  priceChart.timeScale().fitContent();

  // ---------- Z CHART ----------
  const forestEl = $("forestChart");
  if (!forestChart) forestChart = makeChart(forestEl, { height: forestEl.clientHeight });
  else forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });

  if (typeof forestChart.removeSeries !== "function") {
    forestEl.innerHTML = "";
    forestChart = makeChart(forestEl, { height: forestEl.clientHeight });
  } else {
    const series = forestChart._private__serieses || [];
    for (const s of series) { try { forestChart.removeSeries(s); } catch {} }
  }

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
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // NOW Z marker
  if (nowTime) {
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

  // resize (zonder steeds fitContent te resetten)
  window.onresize = () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  };
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

  // defaults
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