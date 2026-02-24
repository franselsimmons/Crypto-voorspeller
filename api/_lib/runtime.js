// /lib/_runtime.js

// ✅ zodat /api/* kan doen: export const config = RUNTIME_CONFIG;
export const RUNTIME_CONFIG = { runtime: "nodejs" };

// ✅ jouw beveiliging: ?secret= of header x-secret / x-api-key
export function requireSecret(req, res) {
  const expected =
    process.env.CC_SECRET ||
    process.env.SECRET ||
    process.env.API_SECRET;

  // Als je geen secret hebt gezet, blokkeren we niet.
  if (!expected) return true;

  const got =
    req.query?.secret ||
    req.headers?.["x-secret"] ||
    req.headers?.["x-api-key"];

  if (String(got || "") !== String(expected)) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    return false;
  }
  return true;
}

// ✅ scan endpoints gebruiken dit
export function getMode(req, def = "bull") {
  const m = String(req.query?.mode || def).toLowerCase();
  return m === "bear" ? "bear" : "bull";
}