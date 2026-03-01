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

    const pred = data.prediction;
    if (!pred) {
      container.innerHTML = `<p>Geen prediction in response. Raw: ${JSON.stringify(data)}</p>`;
      return;
    }

    container.innerHTML = "";
    const div = document.createElement("div");
    div.className = "model";

    const lower = Number(pred.interval?.[0] ?? 0).toFixed(2);
    const upper = Number(pred.interval?.[1] ?? 0).toFixed(2);
    const median = Number(pred.predictedPrice ?? 0).toFixed(2);

    div.innerHTML = `
      <strong>Random Forest (${pred.regime})</strong>
      <p>Mediaan: $${median}</p>
      <p>Interval: $${lower} – $${upper}</p>
      <small>confidence: ${(Number(pred.confidence ?? 0) * 100).toFixed(0)}% | trade: ${pred.shouldTrade ? "JA" : "NEE"}</small>
    `;
    container.appendChild(div);
  } catch (err) {
    container.innerHTML = `<p>Fout: ${String(err)}</p>`;
  }
}

window.onload = () => {
  fetchPredictions();
};