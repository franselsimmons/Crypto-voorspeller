function $(id){ return document.getElementById(id); }
function setPill(text){ $("statusPill").textContent = text; }

async function loadData(){
  // daily + 90 dagen vooruit
  const r = await fetch("/api/forest?tf=1d&h=90&includeLive=1", { headers: { accept: "application/json" } });
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

    // 🔥 dit voelt “normaal” met zoomen/scrollen
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },

    crosshair: { mode: 1 }
  });
}

function sliceLine(data, fromIdx, toIdx){
  if (!Array.isArray(data) || !data.length) return [];
  return data.slice(fromIdx, toIdx);
}

async function init(){
  setPill("Loading…");
  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Forward: ${data.horizonBars} bars`;

  $("debug").textContent = JSON.stringify({
    bandsNow: data.bandsNow,
    freezeNow: data.freezeNow
  }, null, 2);

  // -------- PRICE CHART --------
  const priceEl = $("priceChart");
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

  // Fan bands (upper/lower) — dashed thin
  const fanUpper = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  const fanLower = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dotted
  });
  if (data.forestOverlayForwardUpper?.length) fanUpper.setData(data.forestOverlayForwardUpper);
  if (data.forestOverlayForwardLower?.length) fanLower.setData(data.forestOverlayForwardLower);

  // Forward MID in 3 segmenten: 1-30 / 31-60 / 61-90 (makkelijk te lezen)
  const fwd = data.forestOverlayForwardMid || [];
  const seg1 = sliceLine(fwd, 0, Math.min(31, fwd.length));      // incl start
  const seg2 = sliceLine(fwd, 30, Math.min(61, fwd.length));     // overlap 1 punt
  const seg3 = sliceLine(fwd, 60, fwd.length);

  const fwd1 = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  const fwd2 = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  const fwd3 = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });

  // ✅ 3 verschillende kleuren (week/maand gevoel). Als je andere kleuren wil: zeg het.
  fwd1.applyOptions({ color: "#4aa3ff" }); // dag 1-30
  fwd2.applyOptions({ color: "#7c5cff" }); // dag 31-60
  fwd3.applyOptions({ color: "#ff5ca8" }); // dag 61-90

  if (seg1.length) fwd1.setData(seg1);
  if (seg2.length) fwd2.setData(seg2);
  if (seg3.length) fwd3.setData(seg3);

  priceChart.timeScale().fitContent();

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

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

  // bolletje “waar we nu staan”
  if (data.nowPoint?.time != null && data.nowPoint?.z != null) {
    zTruth.setMarkers([{
      time: data.nowPoint.time,
      position: "inBar",
      shape: "circle",
      color: "#ffffff",
      text: "NOW"
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