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
    timeScale: { borderColor: "#222", timeVisible: true },
    crosshair: { mode: 1 }
  });
}

async function init(){
  setPill("Loading…");
  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth weeks: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"}`;

  $("debug").textContent = JSON.stringify({
    freezeNow: data.freezeNow,
    bandsNow: data.bandsNow
  }, null, 2);

  // -------- PRICE CHART --------
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  const forestTruth = priceChart.addLineSeries({
    lineWidth: 3,
    priceLineVisible: false,
    lastValueVisible: true
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  const forestFwd = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayForward?.length) forestFwd.setData(data.forestOverlayForward);

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  forestChart.priceScale("right").applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  const zTruth = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true
  });
  zTruth.setData(data.forestZTruth || []);

  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // ✅ BELANGRIJK:
  // Onderste chart mag GEEN fitContent doen, want z-data begint later.
  // We gebruiken de tijd-range van de bovenste chart als "waarheid".

  // 1) Eerst boven netjes fitten
  priceChart.timeScale().fitContent();

  // 2) Pak range van boven en zet hem op onder
  const initialRange = priceChart.timeScale().getVisibleLogicalRange();
  if (initialRange) forestChart.timeScale().setVisibleLogicalRange(initialRange);

  // 3) Sync: boven stuurt onder (zonder loop)
  let isSyncing = false;

  priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (!range || isSyncing) return;
    isSyncing = true;
    forestChart.timeScale().setVisibleLogicalRange(range);
    isSyncing = false;
  });

  // (optioneel) Als je óók onder wilt kunnen scrollen, zet dit aan:
  forestChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (!range || isSyncing) return;
    isSyncing = true;
    priceChart.timeScale().setVisibleLogicalRange(range);
    isSyncing = false;
  });

  setPill(data.regimeLabel);

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });

    // na resize opnieuw range kopiëren (anders verschuift hij soms)
    const r = priceChart.timeScale().getVisibleLogicalRange();
    if (r) forestChart.timeScale().setVisibleLogicalRange(r);
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});