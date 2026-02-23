// public/app.js
const { createChart } = LightweightCharts;

let state = {
  tf: "1d",
  h: 90,
  includeLive: 1
};

const elStatus = document.getElementById("statusPill");
const elMeta = document.getElementById("meta");
const elBig = document.getElementById("bigChance");
const elDebug = document.getElementById("debug");

const priceWrap = document.getElementById("priceChart");
const zWrap = document.getElementById("forestChart");

// ---- charts (zoom stabiel) ----
const priceChart = createChart(priceWrap, {
  width: priceWrap.clientWidth,
  height: priceWrap.clientHeight,
  layout: { background: { color: "#0b0f14" }, textColor: "#d7dde7" },
  grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
  rightPriceScale: { autoScale: true, scaleMargins: { top: 0.15, bottom: 0.15 } },
  timeScale: { borderVisible: false }
});

const zChart = createChart(zWrap, {
  width: zWrap.clientWidth,
  height: zWrap.clientHeight,
  layout: { background: { color: "#0b0f14" }, textColor: "#d7dde7" },
  grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
  rightPriceScale: { autoScale: true, scaleMargins: { top: 0.2, bottom: 0.2 } },
  timeScale: { borderVisible: false }
});

const candlesSeries = priceChart.addCandlestickSeries();

const forestTruthSeries = priceChart.addLineSeries({ lineWidth: 3 });
const fwdUpperSeries = priceChart.addLineSeries({ lineWidth: 1, lineStyle: 2 });
const fwdLowerSeries = priceChart.addLineSeries({ lineWidth: 1, lineStyle: 2 });

// 4 segment series (mid)
const fwdSeg = [
  priceChart.addLineSeries({ lineWidth: 3 }),
  priceChart.addLineSeries({ lineWidth: 3 }),
  priceChart.addLineSeries({ lineWidth: 3 }),
  priceChart.addLineSeries({ lineWidth: 3 })
];

// z-score series
const zTruthSeries = zChart.addLineSeries({ lineWidth: 2 });

function resizeCharts() {
  priceChart.applyOptions({ width: priceWrap.clientWidth, height: priceWrap.clientHeight });
  zChart.applyOptions({ width: zWrap.clientWidth, height: zWrap.clientHeight });
}
window.addEventListener("resize", resizeCharts);

document.getElementById("btnFit").addEventListener("click", () => {
  priceChart.timeScale().fitContent();
  zChart.timeScale().fitContent();
});

function setActiveButtons() {
  document.getElementById("btnTF1D").classList.toggle("active", state.tf === "1d");
  document.getElementById("btnTF1W").classList.toggle("active", state.tf === "1w");

  document.querySelectorAll(".btn[data-h]").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.h) === Number(state.h));
  });
}

document.querySelectorAll(".btn[data-tf]").forEach(b => {
  b.addEventListener("click", () => {
    state.tf = b.dataset.tf;
    setActiveButtons();
    load();
  });
});

document.querySelectorAll(".btn[data-h]").forEach(b => {
  b.addEventListener("click", () => {
    state.h = Number(b.dataset.h);
    setActiveButtons();
    load();
  });
});

function safeSetSeries(series, data) {
  series.setData(Array.isArray(data) ? data : []);
}

async function load() {
  elStatus.textContent = "Loading…";
  elStatus.className = "pill";

  const url = `/api/forest?tf=${encodeURIComponent(state.tf)}&h=${encodeURIComponent(state.h)}&includeLive=${state.includeLive ? 1 : 0}`;

  let j;
  try {
    const r = await fetch(url);
    j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Fetch failed");
  } catch (e) {
    elStatus.textContent = "Error";
    elStatus.className = "pill bad";
    elDebug.textContent = String(e?.message || e);
    return;
  }

  // candles
  safeSetSeries(candlesSeries, j.candles || []);

  // truth overlay + z
  safeSetSeries(forestTruthSeries, j.forestOverlayTruth || []);
  safeSetSeries(zTruthSeries, j.forestZTruth || []);

  // forward fan
  safeSetSeries(fwdUpperSeries, j.forestOverlayForwardUpper || []);
  safeSetSeries(fwdLowerSeries, j.forestOverlayForwardLower || []);

  // 4 segmenten (mid)
  const seg = j.forestOverlayForwardMidSeg;
  if (Array.isArray(seg) && seg.length === 4) {
    safeSetSeries(fwdSeg[0], seg[0]);
    safeSetSeries(fwdSeg[1], seg[1]);
    safeSetSeries(fwdSeg[2], seg[2]);
    safeSetSeries(fwdSeg[3], seg[3]);
  } else {
    // fallback: alles leeg
    safeSetSeries(fwdSeg[0], []);
    safeSetSeries(fwdSeg[1], []);
    safeSetSeries(fwdSeg[2], []);
    safeSetSeries(fwdSeg[3], []);
  }

  // status / meta
  const conf = j.confidence || j.nowPoint?.confidence || "low";
  const reg = j.regimeNow || j.nowPoint?.regimeNow || "NEUTRAL";

  elStatus.textContent = j.regimeLabel || `${reg} (${conf})`;
  elStatus.className = `pill ${reg.toLowerCase()}`;

  elMeta.textContent = `Source: ${j.source} • TF: ${j.interval} • Truth: ${j.truthCount} • Live: ${j.hasLive ? "yes" : "no"} • Forward: ${j.horizonBars}`;

  elBig.textContent = `Grootste kans: ${reg} (${conf})`;

  elDebug.textContent = JSON.stringify({
    regimeNow: reg,
    confidence: conf,
    freezeNow: j.freezeNow,
    bandsNow: j.bandsNow,
    nowPoint: j.nowPoint
  }, null, 2);

  // zoom normaal (maar niet telkens irritant resetten)
  priceChart.timeScale().fitContent();
  zChart.timeScale().fitContent();
}

setActiveButtons();
load();