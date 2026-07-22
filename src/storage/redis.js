import { cfg, requireEnv } from "../config.js";

async function call(path, body) {
  requireEnv(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
  const c = cfg();
  // F10: cache "no-store" — zelfde klasse als F8. Next.js kan fetch-antwoorden
  // hergebruiken bij identieke aanvragen; voor databaseverkeer betekent dat oude
  // antwoorden op herhaalde identieke vragen (bewezen: lastRun("FINALIZE") gaf
  // 10 dagen lang het record van 11 juli terug; shard-teller at 4 van de 5 "+1"s).
  // Database-antwoorden mogen NOOIT uit een cache komen.
  const res = await fetch(`${c.redisUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
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
