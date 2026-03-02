/* EOF: /public/app.js */

async function safeRead(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function fetchPredictions() {
  const container = document.getElementById("predictions");
  container.innerHTML = "<p>Voorspelling laden...</p>";

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "forest" })
    });

    const { json, text } = await safeRead(res);

    // Als het niet OK is: toon status + raw response (dit is de echte debug)
    if (!res.ok) {
      const err = json?.error || json?.message || "unknown";
      const detail = json?.detail || "";
      container.innerHTML = `
        <p><b>API fout</b><br>
        Status: ${res.status} ${res.statusText}<br>
        Error: ${err}<br>
        Detail: ${detail}<br><br>
        Raw: <code>${text.replaceAll("<", "&lt;")}</code></p>
      `;
      return;
    }

    // Sommige servers sturen { model, prediction }, andere sturen prediction direct.
    const pred = json?.prediction ? json.prediction : json;

    if (!pred || pred.predictedPrice == null) {
      container.innerHTML = `
        <p>Geen geldige prediction ontvangen.<br>
        Status: ${res.status} ${res.statusText}<br>
        Raw: <code>${text.replaceAll("<", "&lt;")}</code></p>
      `;
      return;
    }

    const current = Number(pred.currentPrice || 0).toFixed(2);
    const predicted = Number(pred.predictedPrice || 0).toFixed(2);
    const movePct = (Number(pred.predictedLogReturn || 0) * 100).toFixed(2);
    const reg = (pred.regime || "unknown").toUpperCase();

    container.innerHTML = `
      <div class="model">
        <strong>BTC Forest Predictor (${reg})</strong>
        <p>Huidige prijs: $${current}</p>
        <p>Verwachte prijs: $${predicted}</p>
        <p>Beweging: ${movePct}%</p>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p>Fout: ${String(err)}</p>`;
  }
}

window.onload = () => {
  fetchPredictions();
};