import { cfg, requireEnv } from "../config.js";

async function call(path, body) {
  requireEnv(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
  const c = cfg();
  const res = await fetch(`${c.redisUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return res.json();
}

/** Eén commando: rcmd("SET","k","v") → result. */
export async function rcmd(...parts) {
  const out = await call("", parts.map(String));
  if (out.error) throw new Error(`Redis: ${out.error}`);
  return out.result;
}

/** Pipeline: rpipe([["SET","a","1"],["GET","a"]]) → [results]. */
export async function rpipe(cmds) {
  if (!cmds.length) return [];
  const out = await call("/pipeline", cmds.map((c) => c.map(String)));
  return out.map((o) => {
    if (o.error) throw new Error(`Redis pipeline: ${o.error}`);
    return o.result;
  });
}

export const jget = async (key) => {
  const raw = await rcmd("GET", key);
  return raw == null ? null : JSON.parse(raw);
};
export const jset = (key, obj, ttlSec) =>
  ttlSec ? rcmd("SET", key, JSON.stringify(obj), "EX", ttlSec) : rcmd("SET", key, JSON.stringify(obj));
