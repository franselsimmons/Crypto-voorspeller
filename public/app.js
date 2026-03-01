async function fetchPrice() {
  const el = document.querySelector("#current-price span");
  try {
    const r = await fetch("/api/price");
    const j = await r.json();
    if (j.price?.c?.[0]) el.textContent = `$${Number(j.price.c[0]).toFixed(2)}`;
    else el.textContent = "niet beschikbaar";
  } catch {
    el.textContent = "fout";
  }
}

async function fetchPrediction() {
  const box = document.querySelector("#predictions");
  box.innerHTML = `<div class="card">Voorspelling laden...</div>`;

  try {
    const r = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "forest" })
    });
    const j = await r.json();
    if (!j.prediction) throw new Error("Geen prediction");

    const p = j.prediction;

    box.innerHTML = `
      <div class="card">
        <div><b>Regime:</b> ${p.regime}</div>
        <div><b>Current:</b> $${Number(p.currentPrice).toFixed(2)}</div>
        <div><b>Pred:</b> $${Number(p.predictedPrice).toFixed(2)}</div>
        <div><b>Interval:</b> $${Number(p.interval[0]).toFixed(2)} – $${Number(p.interval[1]).toFixed(2)}</div>
        <div><b>Pred log return:</b> ${Number(p.predictedLogReturn).toFixed(6)}</div>
        <div><b>Confidence:</b> ${(p.confidence * 100).toFixed(0)}%</div>
        <div><b>Should trade:</b> ${p.shouldTrade ? "✅ JA" : "❌ NEE"}</div>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<div class="card">Fout: ${String(e.message || e)}</div>`;
  }
}

document.querySelector("#refresh").addEventListener("click", async () => {
  await fetchPrice();
  await fetchPrediction();
});

(async () => {
  await fetchPrice();
  await fetchPrediction();
  setInterval(fetchPrice, 30000);
})();