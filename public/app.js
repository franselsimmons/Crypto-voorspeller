// public/app.js
/* global LightweightCharts */

const $ = (id) => document.getElementById(id);

const statusPill = $("statusPill");
const metaEl = $("meta");
const bigChance = $("bigChance");
const debugEl = $("debug");

let TF = "1d";
let H = 30;
let includeLive = 1;

function setStatus(txt, cls = "") {
  statusPill.textContent = txt;
  statusPill.className = `pill ${cls}`.trim();
}

function fmt(n, d = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return n.toFixed(d);
}

function fmtPct(n, d = 0) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(d)}%`;
}

function fmtInt(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return Math.round(n).toString();
}

function pick(el, key, val) {
  el.textContent = `${key}: ${val}`;
}

function bindControls() {
  document.querySelectorAll(".btn[data-tf]").forEach(btn => {
    btn.addEventListener("click", () => {
      TF = btn.dataset.tf;
      refresh();
    });
  });

  document.querySelectorAll(".btn[data-h]").forEach(btn => {
    btn.addEventListener("click", () => {
      H = Number(btn.dataset.h);
      refresh();
    });
  });

  // optioneel: Backtest button als aanwezig
  const btBtn = document.getElementById("btnBacktest");
  if (btBtn) {
    btBtn.addEventListener("click", async () => {
      btBtn.disabled = true;
      btBtn.textContent = "Running…";
      try {
        const url = `/api/forest-backtest?tf=${encodeURIComponent(TF)}&h=${encodeURIComponent(H)}`;
        const r = await fetch(url);
        const j = await r.json();
        debugEl.textContent = JSON.stringify(j, null, 2);
      } finally {
        btBtn.disabled = false;
        btBtn.textContent = "Run";
      }
    });
  }
}

let priceChart, forestChart;
let seriesCandles, seriesOverlayTruth, seriesOverlayLive;
let seriesFwdMid, seriesFwdUp, seriesFwdLo;
let seriesZTruth, seriesZLive;

function initCharts() {
  priceChart = LightweightCharts.createChart($("priceChart"), {
    autoSize: true,
    layout: { background: { color: "#0b0f17" }, textColor: "#c9d1d9" },
    grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false }
  });

  forestChart = LightweightCharts.createChart($("forestChart"), {
    autoSize: true,
    layout: { background: { color: "#0b0f17" }, textColor: "#c9d1d9" },
    grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false }
  });

  seriesCandles = priceChart.addCandlestickSeries();

  seriesOverlayTruth = priceChart.addLineSeries({ lineWidth: 2 });
  seriesOverlayLive  = priceChart.addLineSeries({ lineWidth: 2 });

  seriesFwdMid = priceChart.addLineSeries({ lineWidth: 2, lineStyle: 2 }); // dashed
  seriesFwdUp  = priceChart.addLineSeries({ lineWidth: 1, lineStyle: 2 });
  seriesFwdLo  = priceChart.addLineSeries({ lineWidth: 1, lineStyle: 2 });

  seriesZTruth = forestChart.addLineSeries({ lineWidth: 2 });
  seriesZLive  = forestChart.addLineSeries({ lineWidth: 2 });

  // initial empty
  seriesOverlayLive.setData([]);
  seriesZLive.setData([]);
}

async function refresh() {
  try {
    setStatus("Loading…", "");
    const url = `/api/forest?tf=${encodeURIComponent(TF)}&h=${encodeURIComponent(H)}&includeLive=${includeLive ? "1" : "0"}`;

    const r = await fetch(url);
    const j = await r.json();

    if (j?.error) throw new Error(j.error);

    // meta
    metaEl.textContent = `Source: ${j.source} · TF: ${j.interval} · Truth: ${j.truthCount} · Live: ${j.hasLive ? "yes" : "no"} · Horizon: ${j.horizonBars}`;

    // status label
    const rp = j?.regimeLabel ?? "n/a";
    setStatus(rp, "");

    // biggest chance line
    const np = j?.nowPoint || {};
    const txt = [
      `Regime: ${np.regimeNow ?? "n/a"}`,
      `Confidence: ${np.confidence ?? "n/a"}`,
      `FlipProb: ${fmtPct(np.flipProbability, 0)}`,
      `DI+: ${fmt(np.diPlusNow, 2)}`,
      `DI-: ${fmt(np.diMinusNow, 2)}`,
      `zWin: ${fmtInt(np.zWinUsed)}`,
      `LiqPressure: ${fmt(np.liqPressure, 2)}`,
      `Funding: ${isFinite(np.fundingRate) ? fmt(np.fundingRate, 5) : "n/a"}`,
      `OIΔ1: ${isFinite(np.oiChange1) ? fmtPct(np.oiChange1, 1) : "n/a"}`,
      `ETF: ${isFinite(np.etfNetFlow) ? fmtInt(np.etfNetFlow) : "n/a"}`,
      `SqueezeProb: ${fmtPct(np.squeezeProb, 0)}`
    ].join(" · ");

    bigChance.textContent = txt;

    // charts
    seriesCandles.setData(j.candles);

    seriesOverlayTruth.setData(j.forestOverlayTruth || []);
    seriesOverlayLive.setData(j.forestOverlayLive || []);

    seriesFwdMid.setData(j.forestOverlayForwardMid || []);
    seriesFwdUp.setData(j.forestOverlayForwardUpper || []);
    seriesFwdLo.setData(j.forestOverlayForwardLower || []);

    seriesZTruth.setData(j.forestZTruth || []);
    seriesZLive.setData(j.forestZLive || []);

    // debug
    debugEl.textContent = JSON.stringify({ nowPoint: j.nowPoint }, null, 2);

    setStatus(rp, "");
  } catch (e) {
    setStatus("Error", "bad");
    debugEl.textContent = String(e?.message || e);
  }
}

// boot
bindControls();
initCharts();
refresh();