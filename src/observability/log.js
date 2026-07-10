const SECRET_RE = /secret|token|webhook|authorization|password/i;

function scrub(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_RE.test(k) ? "[redacted]" : typeof v === "object" && v !== null ? scrub(v) : v;
  }
  return out;
}

export function log(level, module, event, fields = {}) {
  const line = { t: new Date().toISOString(), level, module, event, ...scrub(fields) };
  const s = JSON.stringify(line);
  if (level === "error") console.error(s);
  else console.log(s);
}
