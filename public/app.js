function $(id){ return document.getElementById(id); }

let state = {
  tf: "1d",
  h: 90
};

function setPill(text){ $("statusPill").textContent = text; }

function setActiveButtons() {
  $("btnTF1D").classList.toggle("active", state.tf === "1d");
  $("btnTF1W").classList.toggle("active", state.tf === "1w");

  document.querySelectorAll(".btn[data-h]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.h) === state.h);
  });
}

async function loadData(){
  const url = `/api/forest?includeLive=1&tf=${encodeURIComponent(state.tf)}&h=${encodeURIComponent(state.h)}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(text || "API failed");
  return JSON.parse(text);
}

async function runBacktest(){
  const url = `/api/forest-backtest?tf=${encodeURIComponent(state.tf)}&h=${encodeURIComponent(Math.min(state.h, 90))}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(text || "Backtest failed");
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
      rightOffset: 6,
      barSpacing: 8
    },
    crosshair: { mode: 1 }
  });
}

function bindCrosshairSync(a, b) {
  a.subscribeCrosshairMove(param => {
    if (!param || !param.time) return;
    b.timeScale().setVisibleRange(a.timeScale().getVisibleRange());
  });
}

function fmt(n, d=4){
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return n.toFixed(d);
}

async function init(){
  setActiveButtons();
  setPill("Loading…");

  const priceEl = $("priceChart");
  const forestEl = $("forestChart");

  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  // Z chart vaste schaal
  forestChart.priceScale("right").applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  // series
  const candleSeries = priceChart.addCandlestickSeries();
  const forestTruth = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  const forestLive  = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });

  const fwdMid   = priceChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
  const fwdUpper = priceChart.addLineSeries({ lineWidth: 1, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dotted });
  const fwdLower = priceChart.addLineSeries({ lineWidth: 1, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dotted });

  const zTruth = forestChart.addLineSeries({ lineWidth: 2, priceLineVisible: false });
  const zLive  = forestChart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });

  // “nu” marker op Z chart
  const zNow = forestChart.addLineSeries({ lineWidth: 0, priceLineVisible: false });

  function applyData(data){
    $("meta").textContent =
      `Source: ${data.source} • TF: ${data.interval} • Truth: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"} • Horizon: ${data.horizonBars}`;

    candleSeries.setData(data.candles || []);

    forestTruth.setData(data.forestOverlayTruth || []);
    if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive); else forestLive.setData([]);

    // forward fan
    fwdMid.setData(data.forestOverlayForwardMid || []);
    fwdUpper.setData(data.forestOverlayForwardUpper || []);
    fwdLower.setData(data.forestOverlayForwardLower || []);

    zTruth.setData(data.forestZTruth || []);
    if (data.forestZLive?.length) zLive.setData(data.forestZLive); else zLive.setData([]);

    // nu marker: 1 punt
    if (data?.nowPoint?.time && typeof data?.nowPoint?.z === "number") {
      zNow.setData([{ time: data.nowPoint.time, value: data.nowPoint.z }]);
    } else {
      zNow.setData([]);
    }

    // info bovenin
    const np = data.nowPoint || {};
    const big =
      `Regime: ${np.regimeNow ?? "n/a"} • Confidence: ${np.confidence ?? "n/a"} • FlipProb: ${fmt(np.flipProbability, 2)} • ` +
      `DI+: ${fmt(np.diPlus, 2)} DI-: ${fmt(np.diMinus, 2)} • zWin: ${np.zWinUsed ?? "n/a"} • ` +
      `LiqPressure: ${fmt(np.liqPressure, 2)} • Funding: ${fmt(np.fundingRate, 5)}`;

    $("bigChance").textContent = big;

    // debug blok
    $("debug").textContent = JSON.stringify({
      nowPoint: data.nowPoint,
      bandsNow: data.bandsNow,
      freezeNow: data.freezeNow,
      funding: data.funding?.source ? data.funding : undefined,
      liqLevelsTop: (data.liqLevels || []).slice(0, 6)
    }, null, 2);

    setPill(data.regimeLabel || "Forest");

    priceChart.timeScale().fitContent();
    forestChart.timeScale().fitContent();
  }

  async function reload(){
    setActiveButtons();
    setPill("Loading…");
    const data = await loadData();
    applyData(data);
  }

  // buttons
  $("btnTF1D").addEventListener("click", () => { state.tf = "1d"; reload().catch(showErr); });
  $("btnTF1W").addEventListener("click", () => { state.tf = "1w"; reload().catch(showErr); });

  document.querySelectorAll(".btn[data-h]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.h = Number(btn.dataset.h);
      reload().catch(showErr);
    });
  });

  $("btnBacktest").addEventListener("click", async () => {
    try {
      const bt = await runBacktest();
      alert(`Backtest (${bt.interval}, horizon ${bt.horizonBars})\n` +
        `high winrate: ${bt.buckets.high.winrate}\n` +
        `mid  winrate: ${bt.buckets.mid.winrate}\n` +
        `low  winrate: ${bt.buckets.low.winrate}\n\n` +
        `signalsUsed: ${bt.signalsUsed}`);
    } catch (e) {
      showErr(e);
    }
  });

  function showErr(err){
    console.error(err);
    document.body.innerHTML =
      `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
  }

  // resize fix (zoom/fit stabiel)
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });

  // (lichte) sync
  bindCrosshairSync(priceChart, forestChart);

  // first load
  await reload();
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});