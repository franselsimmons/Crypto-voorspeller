export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { cfg } from "../../../../src/config.js";
import { adminJson } from "../../../../src/site/adminRoute.js";

/**
 * Digest-logica leeft in de cron-route; handmatig triggeren gebeurt via een
 * server-side self-fetch met CRON_SECRET zodat exact hetzelfde codepad,
 * dezelfde lock en dezelfde dedupe gelden. Vereist correcte APP_URL.
 */
export async function GET(req) {
  return adminJson(req, async () => {
    const c = cfg();
    const date = new URL(req.url).searchParams.get("date");
    const url = new URL("/api/cron/daily-digest", c.appUrl);
    if (date) url.searchParams.set("date", date);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${c.cronSecret}` },
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => ({ error: "ongeldige response" }));
    if (!res.ok) throw new Error(json?.errorSummary || json?.error || `HTTP ${res.status}`);
    return { manual: true, viaCronRoute: true, result: json };
  });
}
