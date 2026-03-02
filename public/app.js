/* EOF: /public/app.js */
async function fetchPredictions() {
  const container = document.getElementById("predictions");
  container.innerHTML = "<p>Voorspelling laden...</p>";

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "forest" })
    });

    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `<p>API fout: ${data?.error || "unknown"}<br>${data?.detail || ""}</p>`;
      return;
    }

    // ✅ jouw API geeft direct de prediction terug
    const pred = data;

    container.innerHTML = "";
    const div = document.createElement("div");
    div.className = "model";

    const median = Number(pred.predictedPrice ?? 0).toFixed(2);
    const movePct = Number(pred.movePct ?? 0).toFixed(2);

    div.innerHTML = `
      <strong>Forest Bias (${pred.bias || pred.regime})</strong>
      <p>Huidig: $${Number(pred.currentPrice ?? 0).toFixed(2)}</p>
      <p>Voorspeld: $${median} (${movePct}%)</p>
      <p>ADX14: ${Number(pred.adx14 ?? 0).toFixed(1)} | Trend: ${pred.isTrending ? "JA" : "NEE"}</p>
      <p>Regime: ${pred.regime} | Bias: <b>${pred.bias || "NEUTRAL"}</b></p>
      <small>confidence: ${(Number(pred.confidence ?? 0) * 100).toFixed(0)}% | reason: ${pred.reason || ""}</small>
    `;

    container.appendChild(div);
  } catch (err) {
    container.innerHTML = `<p>Fout: ${String(err)}</p>`;
  }
}

window.onload = () => {
  fetchPredictions();
};