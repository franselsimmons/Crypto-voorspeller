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
    crosshair: { mode: 1 }
  });
}

function lastValue(arr){
  if (!arr || !arr.length) return null;
  return arr[arr.length - 1]?.value ?? null;
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

  const forestFwd = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayForward?.length) forestFwd.setData(data.forestOverlayForward);

  priceChart.timeScale().fitContent();

  // -------- Z CHART --------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  forestChart.priceScale("right").applyOptions({
    autoScale: false,
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

  // ✅ NU-MARKERING in Z-chart (horizontale lijn op huidige waarde)
  // Als live bestaat gebruiken we live, anders truth.
  const zNow = lastValue((data.forestZLive && data.forestZLive.length) ? data.forestZLive : data.forestZTruth);
  if (zNow != null) {
    // maak een extra serie die alleen een priceLine toont
    const nowLine = forestChart.addLineSeries({
      lineWidth: 1,
      priceLineVisible: true,
      lastValueVisible: false,
      lineVisible: false // we willen geen extra lijn door de chart, alleen de priceLine
    });

    // priceLine opties (tekst + stijl)
    nowLine.applyOptions({
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LightweightCharts.LineStyle.Dashed,
      priceLineSource: 0,
      title: `NOW Z`
    });

    // truc: zet 1 datapunt (mag op laatste candle time), zodat de chart weet dat deze serie “bestaat”
    const lastT = (data.forestZTruth && data.forestZTruth.length) ? data.forestZTruth[data.forestZTruth.length - 1].time : null;
    if (lastT != null) nowLine.setData([{ time: lastT, value: zNow }]);
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