function $(id){ return document.getElementById(id); }

let state = { tf: "1d", h: 90 };

function setPill(text){ $("statusPill").textContent = text; }

function setActiveButtons(){
  document.querySelectorAll(".btn[data-tf]").forEach(b => b.classList.toggle("active", b.dataset.tf === state.tf));
  document.querySelectorAll(".btn[data-h]").forEach(b => b.classList.toggle("active", Number(b.dataset.h) === state.h));
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
      rightOffset: 8,
      barSpacing: 8
    },
    crosshair: { mode: 1 }
  });
}

function fmtPct(x){
  if (typeof x !== "number" || !Number.isFinite(x)) return "n/a";
  return `${Math.round(x * 100)}%`;
}

function wireButtons(reload){
  document.querySelectorAll(".btn[data-tf]").forEach(b => {
    b.addEventListener("click", () => {
      state.tf = b.dataset.tf;
      setActiveButtons();
      reload();
    });
  });

  document.querySelectorAll(".btn[data-h]").forEach(b => {
    b.addEventListener("click", () => {
      state.h = Number(b.dataset.h);
      setActiveButtons();
      reload();
    });
  });
}

function addNowMarker(series, time, text){
  if (!time) return;
  series.setMarkers([{
    time,
    position: "inBar",
    shape: "circle",
    color: "#ffffff",
    text: text || "NOW"
  }]);
}

async function init(){
  setActiveButtons();

  async function render(){
    setPill("Loading…");
    const data = await loadData();

    $("meta").textContent =
      `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Horizon: ${data.horizonBars}`;

    const np = data.nowPoint || {};
    $("bigChance").textContent =
      `Confidence: ${np.confidence || "n/a"} • Stability: ${np.stabilityScore ?? "n/a"} • FlipProb: ${fmtPct(np.flipProbability)} • Funding: ${data.funding?.fundingRate ?? "n/a"} (${data.funding?.fundingSource ?? "none"})`

    $("debug").textContent = JSON.stringify({
      regimeLabel: data.regimeLabel,
      freezeNow: data.freezeNow,
      bandsNow: data.bandsNow,
      nowPoint: data.nowPoint,
      liqLevelsTop: (data.liqLevels || []).slice(0, 6)
    }, null, 2);

    $("priceChart").innerHTML = "";
    $("forestChart").innerHTML = "";

    // PRICE
    const priceEl = $("priceChart");
    const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

    const candles = priceChart.addCandlestickSeries();
    candles.setData(data.candles || []);

    const forestTruth = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
    forestTruth.setData(data.forestOverlayTruth || []);

    const forestLive = priceChart.addLineSeries({
      lineWidth: 2,
      priceLineVisible: false,
      lineStyle: LightweightCharts.LineStyle.Dashed
    });
    if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

    const fwdMid = priceChart.addLineSeries({
      lineWidth: 2,
      priceLineVisible: false,
      lineStyle: LightweightCharts.LineStyle.Dashed
    });
    if (data.forestOverlayForwardMid?.length) fwdMid.setData(data.forestOverlayForwardMid);

    const fwdUp = priceChart.addLineSeries({
      lineWidth: 1,
      priceLineVisible: false,
      lineStyle: LightweightCharts.LineStyle.Dashed
    });
    if (data.forestOverlayForwardUpper?.length) fwdUp.setData(data.forestOverlayForwardUpper);

    const fwdLo = priceChart.addLineSeries({
      lineWidth: 1,
      priceLineVisible: false,
      lineStyle: LightweightCharts.LineStyle.Dashed
    });
    if (data.forestOverlayForwardLower?.length) fwdLo.setData(data.forestOverlayForwardLower);

    addNowMarker(candles, np.time, "NOW");
    priceChart.timeScale().fitContent();

    // Z
    const forestEl = $("forestChart");
    const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

    forestChart.priceScale("right").applyOptions({
      autoScale: false,
      scaleMargins: { top: 0.2, bottom: 0.2 }
    });

    const zTruth = forestChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
    zTruth.setData(data.forestZTruth || []);

    const zLive = forestChart.addLineSeries({
      lineWidth: 2,
      priceLineVisible: false,
      lineStyle: LightweightCharts.LineStyle.Dashed
    });
    if (data.forestZLive?.length) zLive.setData(data.forestZLive);

    addNowMarker(zTruth, np.time, "NOW");
    forestChart.timeScale().fitContent();

    setPill(data.regimeLabel || "OK");

    window.onresize = () => {
      priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
      forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
    };
  }

  wireButtons(render);
  await render();
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});