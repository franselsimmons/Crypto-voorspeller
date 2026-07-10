import { cfg } from "../config.js";
import { rcmd, rpipe } from "../storage/redis.js";
import { K, TTL } from "../storage/keys.js";
import { signalEmbed, digestEmbed, statusChangeEmbed, statusEmbed } from "./templates.js";
import { log } from "../observability/log.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function logSend(entry) {
  try {
    await rpipe([
      ["LPUSH", K.discordLogs(), JSON.stringify({ t: Date.now(), ...entry })],
      ["LTRIM", K.discordLogs(), 0, 99],
    ]);
  } catch { /* logging mag nooit de pipeline breken */ }
}

/**
 * Post met retry/backoff, 429-respect, dedupe en Redis-log.
 * Discord-fouten breken scan/meting nooit: altijd boolean terug, nooit throw.
 */
async function post(channel, payload, dedupeKey = null) {
  const url = cfg().webhooks[channel];
  if (!url) return false;
  if (dedupeKey) {
    const fresh = await rcmd("SET", K.discordDedupe(dedupeKey, channel), "1", "NX", "EX", TTL.dedupe);
    if (fresh !== "OK") return false;
  }
  let lastStatus = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      lastStatus = res.status;
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        await sleep(Math.min(5000, (Number(j.retry_after) || 1) * 1000));
        continue;
      }
      if (res.ok) {
        await logSend({ channel, status: res.status, ok: true, dedupeKey });
        return true;
      }
      if (res.status >= 500) { await sleep(400 * attempt); continue; }
      break; // overige 4xx: geen retry
    } catch (err) {
      lastStatus = String(err?.message || err);
      await sleep(300 * attempt);
    }
  }
  await logSend({ channel, status: lastStatus, ok: false, dedupeKey });
  log("error", "discord", "post_failed", { channel, status: lastStatus });
  return false;
}

export async function publishSignal(record, famStat) {
  const embed = signalEmbed(record, famStat);
  const primary = await post("setups", embed, record.signalId);
  if (famStat?.status === "VERIFIED") await post("verified", embed, record.signalId);
  return primary;
}

export const postStatusChange = (ch) =>
  post("status", statusChangeEmbed(ch), `fam:${ch.familyId}:${ch.to}:${ch.at}`);

export const postDigest = (d) => post("digest", digestEmbed(d), `digest:${d.date}`);

export const postStatus = (title, fields) => post("status", statusEmbed(title, fields));
