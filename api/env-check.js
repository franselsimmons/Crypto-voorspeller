// api/env-check.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const key = process.env.COINGLASS_KEY || "";
  res.status(200).json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyPrefix: key ? key.slice(0, 4) + "…" : null
  });
}