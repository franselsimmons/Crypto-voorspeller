function $(id){ return document.getElementById(id); }
function setPill(text){ $("statusPill").textContent = text; }

let state = { tf: "1d", h: 90 };

function setActiveButtons(){
  document.querySelectorAll(".btn[data-tf]").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-tf") === state.tf);
  });
  document.querySelectorAll(".btn[data-h]").forEach(b => {
    b.classList.toggle("active", Number(b.getAttribute("data-h")) === state.h);
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
    rightPriceScale: { borderColor: "#222" },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 },
    handleScroll: true,
    handleScale: true,
  });
}

function clearEl(el){ el.innerHTML = ""; }

async function init(){
  setActiveButtons();

  document.querySelectorAll(".btn[data-tf]").forEach(btn => {
    btn.addEventListener("click", async () => {
      state.tf = btn.getAttribute("data-tf");
      setActiveButtons();
      await render();
    });
  });

  document.querySelectorAll(".btn[data-h]").forEach(btn => {
    btn.addEventListener("click", async () => {
      state.h = Number(btn.getAttribute("data-h"));
      setActiveButtons();
      await render();
    });
  });

  await render();
}

async function render(){
  setPill("Loading…");

  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Forward: ${data.horizonBars}`;

  $("bigChance").textContent = `Grootste kans: ${data.biggestChance}`;

  $("debug").textContent = JSON.stringify({
    confidence: data.confidence,
    adxNow: data.adxNow,
    freezeNow: data.freezeNow,
    weeklyBias: data.weeklyBias,
    bandsNow: data.bandsNow
  }, null, 2);

  // Reset charts
  const priceEl = $("priceChart");
  const forestEl = $("forestChart");
  clearEl(priceEl); clearEl(forestEl);

  // -------- PRICE CHART --------
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  // Truth overlay (solid)
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  // Live overlay (dashed)
  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  // Forward fan (upper/lower thin dashed)
  const fUp = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  const fLo = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  if (data.forestOverlayForwardUpper?.length) fUp.setData(data.forestOverlayForwardUpper);
  if (data.forestOverlayForwardLower?.length) fLo.setData(data.forestOverlayForwardLower);

  // Forward MID in 4 kleuren (week1-4)
  const f1 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#FFD166" });
  const f2 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#F8961E" });
  const f3 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#F3722C" });
  const f4 = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed, color: "#F94144" });

  if (data.forestOverlayForwardMidW1?.length) f1.setData(data.forestOverlayForwardMidW1);
  if (data.forestOverlayForwardMidW2?.length) f2.setData(data.forestOverlayForwardMidW2);
  if (data.forestOverlayForwardMidW3?.length) f3.setData(data.forestOverlayForwardMidW3);
  if (data.forestOverlayForwardMidW4?.length) f4.setData(data.forestOverlayForwardMidW4);

  priceChart.timeScale().fitContent();

  // -------- Z CHART --------
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
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // NOW bolletje op Z
  if (data.nowPoint?.time != null && data.nowPoint?.value != null) {
    const zNowSeries = forestChart.addLineSeries({ lineWidth: 0, priceLineVisible: false });
    zNowSeries.setData([{ time: data.nowPoint.time, value: data.nowPoint.value }]);
    zNowSeries.setMarkers([{
      time: data.nowPoint.time,
      position: "inBar",
      color: "#ffffff",
      shape: "circle",
      text: "NOW"
    }]);
  }

  forestChart.timeScale().fitContent();

  setPill(data.regimeLabel);

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  }, { once: true });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});