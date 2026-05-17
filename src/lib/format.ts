export function toText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

export function toUpperText(value: unknown, fallback = ""): string {
  const text = toText(value, fallback);
  return text ? text.toUpperCase() : fallback;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace("$", "")
    .replace("%", "")
    .replace("R", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function toBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();

  if (["true", "yes", "y", "1", "ja"].includes(text)) return true;
  if (["false", "no", "n", "0", "nee"].includes(text)) return false;

  return null;
}

export function compactNumber(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

export function pct(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${compactNumber(n, decimals)}%`;
}

export function r(value: unknown, decimals = 3): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${compactNumber(n, decimals)}R`;
}

export function money(value: unknown, decimals = 6): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `$${compactNumber(n, decimals)}`;
}

export function dateTime(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}