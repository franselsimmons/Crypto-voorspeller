import { hrbCfg, hrbFamilyId } from "./config.js";
import { rcmd, rpipe } from "../storage/redis.js";
import { HK, HTTL } from "./hrbKeys.js";
import { acquireLock, releaseLock } from "../security/locks.js";
import { sha256Hex } from "../utils/hash.js";
import { openHrbPosition } from "./hrbMonitor.js";
import { loadHrbFamilies, hrbBumpSeen } from "./hrbFamilyEngine.js";
import { iso } from "../utils/time.js";
import { log } from "../observability/log.js";

const TF_MS = 15 * 60 * 1000;
const FORCE_AFTER_MS = 12 * 60 * 1000;

function makeSignalId(c, cand) {
  const raw = [c.indicatorVersion, c.parameterHash, cand.symbol, cand.direction, cand.class, cand.entryOpenTime].join("|");
  return `HRB-${sha256Hex(raw).slice(0, 16)}`;
}

async function finalizeOne(cycleId) {
  const c = hrbCfg();
  const token = await acquireLock(`hrb:finalize:${cycleId}`, 60000);
  if (!token) return { status: "SKIPPED_LOCKED", cycleId, cycleIso: iso(cycleId) };
  try {
    const cyc = await rcmd("HGETALL", HK.scanCycle(cycleId));
    const meta = {};
    for (let i = 0; i < (cyc?.length || 0); i += 2) meta[cyc[i]] = cyc[i + 1];
    if (meta.status === "FINALIZED") return { status: "SKIPPED_DUPLICATE", cycleId, cycleIso: iso(cycleId) };

    const expected = Number(meta.expectedShardCount || 1);
    const shardKeys = Array.from({ length: expected }, (_, i) => HK.scanShard(cycleId, i));
    const existsFlags = await rpipe(shardKeys.map((k) => ["EXISTS", k]));
    const present = existsFlags.reduce((s, v) => s + Number(v || 0), 0);
    const age = Date.now() - cycleId;
    if (present === 0) return { status: "NO_SHARDS", cycleId, cycleIso: iso(cycleId), present, expected };
    if (present < expected && age < FORCE_AFTER_MS) return { status: "WAITING", cycleId, cycleIso: iso(cycleId), present, expected };

    const shardRaw = await rpipe(shardKeys.map((k) => ["GET", k]));
    const candidates = shardRaw.filter(Boolean).flatMap((s) => JSON.parse(s).candidates || []);

    const fams = await loadHrbFamilies();
    const created = [];
    const seenByFamily = {};

    for (const cand of candidates) {
      const signalId = makeSignalId(c, cand);
      if (await rcmd("EXISTS", HK.signal(signalId))) continue;

      const cdRaw = await rcmd("GET", HK.cooldown(cand.symbol, cand.direction));
      if (cdRaw != null && cand.entryOpenTime - Number(cdRaw) < TF_MS * 8) continue;

      const fp = `${cand.fingerprintBase}:${cand.symbol}`;
      const fpNew = await rcmd("SET", HK.fingerprint(fp), signalId, "NX", "EX", HTTL.fingerprint);
      if (fpNew !== "OK") continue;

      const fam = hrbFamilyId(cand.direction, cand.class);
      const famStat = fams[fam] || {};
      const record = {
        signalId, symbol: cand.symbol, direction: cand.direction, class: cand.class,
        pressure: cand.pressure,
        entry: cand.plan.entry, stopLoss: cand.plan.stop, tp1: cand.plan.tp1, tp2: cand.plan.tp2,
        riskDistance: cand.plan.distance, stopAtr: cand.plan.stopAtr,
        rrToTp1: cand.plan.rrToTp1, rrToTp2: cand.plan.rrToTp2, roomToStructureR: cand.plan.roomToStructureR,
        candleTime: cand.entryOpenTime, candleTimeIso: iso(cand.entryOpenTime),
        structureBias: cand.context?.structureBias ?? 0,
        confirmedLevel: cand.context?.confirmedLevel ?? null, strongLevel: cand.context?.strongLevel ?? null,
        tick: cand.tick, familyId: fam, familyStatusAtSignal: famStat.status || "COLLECTING",
        indicatorVersion: c.indicatorVersion, parameterHash: c.parameterHash, engineVersion: c.engineVersion,
        system: "HRB", status: "OPEN", outcome: null, createdAt: Date.now(),
      };

      await rpipe([
        ["SET", HK.signal(signalId), JSON.stringify(record)],
        ["ZADD", HK.byTime(), record.candleTime, signalId],
        ["SADD", HK.open(), signalId],
        ["SET", HK.cooldown(cand.symbol, cand.direction), cand.entryOpenTime, "EX", HTTL.cooldown],
      ]);
      await openHrbPosition(record);
      seenByFamily[fam] = (seenByFamily[fam] || 0) + 1;
      created.push(record);
    }

    for (const [fid, nn] of Object.entries(seenByFamily)) await hrbBumpSeen(fid, nn);

    await rpipe([
      ["HSET", HK.scanCycle(cycleId), "status", "FINALIZED", "completedAt", Date.now()],
      ["EXPIRE", HK.scanCycle(cycleId), HTTL.cycle],
    ]);
    log("info", "hrb-finalize", "done", { cycleId, present, expected, candidates: candidates.length, created: created.length });
    return { status: present < expected ? "PARTIAL" : "SUCCESS", cycleId, cycleIso: iso(cycleId), present, expected, candidates: candidates.length, created: created.length };
  } finally {
    await releaseLock(`hrb:finalize:${cycleId}`, token);
  }
}

export async function finalizeHrbCycle(cycleId) {
  const targets = [cycleId - 2 * TF_MS, cycleId - TF_MS, cycleId];
  const swept = [];
  for (const cy of targets) {
    try { swept.push(await finalizeOne(cy)); }
    catch (err) { swept.push({ status: "FAILED", cycleId: cy, cycleIso: iso(cy), error: String(err?.message || err) }); }
  }
  const done = [...swept].reverse().find((s) => s.status === "SUCCESS" || s.status === "PARTIAL");
  const head = swept[swept.length - 1];
  return { status: (done || head).status, cycleId, swept };
}
