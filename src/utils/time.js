export const now = () => Date.now();
export const floorTo = (ms, step) => Math.floor(ms / step) * step;
export const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const iso = (ms) => new Date(ms).toISOString();
export const minutesBetween = (a, b) => Math.round((b - a) / 60000);

/** cycleId = openTime van de candle die nu vormt, met veiligheidsmarge. */
export function currentCycleId(tfMs, marginMs = 45000) {
  return floorTo(now() - marginMs, tfMs);
}

export function lastClosedOpenTime(tfMs, marginMs = 45000) {
  return currentCycleId(tfMs, marginMs) - tfMs;
}
