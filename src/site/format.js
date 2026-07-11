export const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`);
export const rCls = (v) => (v == null ? "dim" : v >= 0 ? "pos" : "neg");
export const fmtDateTime = (ms) =>
  ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
export const fmtDate = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");
export const fmtDur = (m) =>
  m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

export function statusBadge(status) {
  if (status === "VERIFIED") return "badge badge-verified";
  if (status === "LOST_EDGE") return "badge badge-lost";
  if (status === "COLLECTING") return "badge badge-collecting";
  return "badge badge-neutral";
}
