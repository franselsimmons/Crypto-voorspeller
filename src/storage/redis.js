import { cfg } from "../config.js";

function getRedisConfig() {
  const c = cfg();

  const redisUrl = (
    c.redisUrl ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  const redisToken = (
    c.redisToken ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    ""
  ).trim();

  const missing = [];

  if (!redisUrl) {
    missing.push(
      "UPSTASH_REDIS_REST_URL of KV_REST_API_URL"
    );
  }

  if (!redisToken) {
    missing.push(
      "UPSTASH_REDIS_REST_TOKEN of KV_REST_API_TOKEN"
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Ontbrekende Redis env: ${missing.join(", ")}`
    );
  }

  return {
    redisUrl,
    redisToken,
  };
}

async function call(path, body) {
  const { redisUrl, redisToken } = getRedisConfig();

  const res = await fetch(`${redisUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Redis HTTP ${res.status}`);
  }

  return res.json();
}

/** Eén commando: rcmd("SET", "k", "v") → result. */
export async function rcmd(...parts) {
  const out = await call("", parts.map(String));

  if (out.error) {
    throw new Error(`Redis: ${out.error}`);
  }

  return out.result;
}

/** Pipeline: rpipe([["SET", "a", "1"], ["GET", "a"]]) → [results]. */
export async function rpipe(cmds) {
  if (!cmds.length) {
    return [];
  }

  const out = await call(
    "/pipeline",
    cmds.map((command) => command.map(String))
  );

  return out.map((result) => {
    if (result.error) {
      throw new Error(
        `Redis pipeline: ${result.error}`
      );
    }

    return result.result;
  });
}

export async function jget(key) {
  const raw = await rcmd("GET", key);

  if (raw == null) {
    return null;
  }

  return JSON.parse(raw);
}

export function jset(key, obj, ttlSec) {
  const value = JSON.stringify(obj);

  if (ttlSec) {
    return rcmd(
      "SET",
      key,
      value,
      "EX",
      ttlSec
    );
  }

  return rcmd(
    "SET",
    key,
    value
  );
}