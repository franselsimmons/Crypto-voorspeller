/* EOF: /public/app.js */

async function fetchPredictions() {
  const container = document.getElementById("predictions");
  container.innerHTML = "<p>Voorspelling laden...</p>";

  try {
    const res = await fetch("/api/predict");
    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `
        <p>API fout: ${data?.error || "unknown"}<br>
        ${data?.detail || ""}</p>
      `;
      return;
    }

    if (!data.predictedPrice) {
      container.innerHTML = `
        <p>Geen geldige prediction ontvangen.<br>
        Raw: ${JSON.stringify(data)}</p>
      `;
      return;
    }

    const current = Number(data.currentPrice || 0).toFixed(2);
    const predicted = Number(data.predictedPrice || 0).toFixed(2);
    const move = (Number(data.predictedLogReturn || 0) * 100).toFixed(2);
    const regime = data.regime || "unknown";

    const direction = move >= 0 ? "📈 Verwacht omhoog" : "📉 Verwacht omlaag";

    container.innerHTML = `
      <div class="model">
        <strong>BTC Forest Predictor (${regime.toUpperCase()})</strong>
        <p>Huidige prijs: $${current}</p>
        <p>Verwachte prijs: $${predicted}</p>
        <p>Beweging: ${move}%</p>
        <p>${direction}</p>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p>Fout: ${String(err)}</p>`;
  }
}

window.onload = () => {
  fetchPredictions();
};