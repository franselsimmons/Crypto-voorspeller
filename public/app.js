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
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    handleScale: { mouseWheel: true, pinch: true }
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

async function init(){
  setPill("Loading…");
  const data = await loadData();

  const priceEl = $("priceChart");
  priceEl.style.touchAction = "none";
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  // ====== VERLEDEN (TRUTH) ======
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 3,
    priceLineVisible: false,
    color: "rgba(46,163,255,1)"
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  const nowOverlay = lastPoint(data.forestOverlayTruth || []);
  addNowMarker(forestTruth, nowOverlay, "NOW");

  // ====== FORWARD 4 WEKEN MET 4 KLEUREN ======
  const fwd = data.forestOverlayForward || [];

  if (fwd.length >= 5) {
    // fwd[0] = huidige punt
    const colors = [
      "rgba(255,255,255,0.95)",   // week 1
      "rgba(255,200,0,0.95)",     // week 2
      "rgba(255,120,0,0.95)",     // week 3
      "rgba(255,0,0,0.95)"        // week 4
    ];

    for (let i = 0; i < 4; i++) {
      const segment = priceChart.addLineSeries({
        lineWidth: 3,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        priceLineVisible: false,
        color: colors[i]
      });

      segment.setData([
        fwd[i],     // start
        fwd[i + 1]  // end
      ]);
    }
  }

  priceChart.timeScale().fitContent();

  // ====== Z SCORE CHART ======
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

  const nowZ = lastPoint(data.forestZTruth || []);
  addNowMarker(zTruth, nowZ, "NOW Z");

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