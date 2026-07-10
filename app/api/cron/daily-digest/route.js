export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { checkCron } from "../../../../src/security/auth.js";
import { rcmd, rpipe, jset } from "../../../../src/storage/redis.js";
import { K } from "../../../../src/storage/keys.js";
import { loadFamilies } from "../../../../src/verification/familyEngine.js";
import { dailyManifest } from "../../../../src/storage/hashChain.js";
import { postDigest, postStatus } from "../../../../src/discord/discord.js";
import { saveRun, lastRun } from "../../../../src/observability/runs.js";
import { utcDate } from "../../../../src/utils/time.js";
import { FAMILY_IDS } from "../../../../src/config.js";

const ROUTE_VERSION = "1.0.0";
const DAY_MS = 86400000;

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? utcDate(Date.now() - DAY_MS);
  try {
    const dayStart = Date.parse(`${date}T00:00:00.000Z`);
    const dayEnd = dayStart + DAY_MS - 1;

    const newIds = (await rcmd("ZRANGEBYSCORE", K.byTime(), dayStart, dayEnd)) || [];
    const closedIds = (await rcmd("ZRANGEBYSCORE", K.closed(), dayStart, dayEnd, "LIMIT", 0, 500)) || [];
    let netR = 0;
    if (closedIds.length) {
      const raws = await rpipe(closedIds.map((id) => ["GET", K.signal(id)]));
      for (const raw of raws) {
        if (!raw) continue;
        const s = JSON.parse(raw);
        if (s.outcome?.netR != null) netR += s.outcome.netR;
      }
    }
    const open = Number((await rcmd("SCARD", K.open())) || 0);
    const fams = await loadFamilies();
    const families = FAMILY_IDS.map((fid) => ({
      familyId: fid, status: fams[fid].status,
      completed: fams[fid].completed, avgNetR: fams[fid].avgNetR,
    }));
    const verifiedCount = families.filter((f) => f.status === "VERIFIED").length;
    const manifest = await dailyManifest(date);

    const digest = {
      date, newSignals: newIds.length, closed: closedIds.length,
      netR: Number(netR.toFixed(2)), open, verifiedCount, families, manifest,
    };
    await jset(K.daily(date), digest);
    await rcmd("ZADD", K.dailyIndex(), dayStart, date);
    await postDigest(digest);

    const scanRun = await lastRun("FINALIZE");
    await postStatus("ARS-U · heartbeat", {
      Datum: date,
      "Laatste finalize": scanRun ? `${scanRun.status} · ${new Date(scanRun.completedAt).toISOString()}` : "—",
      "Open posities": String(open),
      "Daily root hash": manifest.dailyRootHash ?? "—",
    });

    const run = await saveRun("DIGEST", {
      status: "SUCCESS", date, startedAt, completedAt: Date.now(),
      durationMs: Date.now() - startedAt, newSignals: newIds.length,
      closed: closedIds.length, routeVersion: ROUTE_VERSION,
    });
    return Response.json({ ...run, digest });
  } catch (err) {
    const run = await saveRun("DIGEST", {
      status: "FAILED", date, startedAt, completedAt: Date.now(),
      errorSummary: String(err?.message || err), routeVersion: ROUTE_VERSION,
    });
    return Response.json(run, { status: 500 });
  }
}
