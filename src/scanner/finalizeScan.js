import { cfg, familyId } from "../config.js";
import { jget, rcmd, rpipe } from "../storage/redis.js";
import { K, TTL } from "../storage/keys.js";
import { acquireLock, releaseLock } from "../security/locks.js";
import { sha256Hex } from "../utils/hash.js";
import { appendChain } from "../storage/hashChain.js";
import { openPosition } from "../trade/positionEngine.js";
import { loadFamilies, bumpSeen } from "../verification/familyEngine.js";
import { publishSignal } from "../discord/discord.js";
import { utcDate, iso } from "../utils/time.js";
import { log } from "../observability/log.js";

function makeSignalId(c, cand) {
  const raw = [c.indicatorVersion, c.parameterHash, cand.symbol, cand.direction, cand.setupType, cand.class, cand.entryOpenTime].join("|");
  return `ARS-${sha256Hex(raw).slice(0, 16)}`;
}

function publishOrder(a, b, fams) {
  const elite = (x) => (x.class === "ELITE" ? 1 : 0);
  if (elite(b) !== elite(a)) return elite(b) - elite(a);
  if (b.score !== a.score) return b.score - a.score;
  const fa = fams[familyId(a.direction, a.setupType, a.class)] || {};
  const fb = fams[familyId(b.direction, b.setupType, b.class)] || {};
  const va = fa.status === "VERIFIED" ? 1 : 0, vb = fb.status === "VERIFIED" ? 1 : 0;
  if (vb !== va) return vb - va;
  const la = fa.lcb ?? -99, lb = fb.lcb ?? -99;
  if (lb !== la) return lb - la;
  if ((b.scoreParts?.entry ?? 0) !== (a.scoreParts?.entry ?? 0)) return (b.scoreParts?.entry ?? 0) - (a.scoreParts?.entry ?? 0);
  return (b.plan.roomToStructureR ?? 0) - (a.plan.roomToStructureR ?? 0);
}

export async function finalizeCycle(cycleId) {
  const c = cfg();
  const token = await acquireLock(`finalize:${cycleId}`, 60000);
  if (!token) return { status: "SKIPPED_LOCKED", cycleId };
  try {
    const cyc = await rcmd("HGETALL", K.scanCycle(cycleId));
    const meta = {};
    for (let i = 0; i < (cyc?.length || 0); i += 2) meta[cyc[i]] = cyc[i + 1];
    if (meta.status === "FINALIZED") return { status: "SKIPPED_DUPLICATE", cycleId };
    const expected = Number(meta.expectedShardCount || c.scanShards);
    const completed = Number(meta.completedShardCount || 0);
    const cycleAge = Date.now() - cycleId;
    if (completed < expected && cycleAge < 10 * 60 * 1000) {
      return { status: "WAITING", cycleId, completed, expected };
    }

    const shardKeys = Array.from({ length: expected }, (_, i) => K.scanShard(cycleId, i));
    const shardRaw = await rpipe(shardKeys.map((k) => ["GET", k]));
    const candidates = shardRaw.filter(Boolean).flatMap((s) => JSON.parse(s).candidates || []);

    const fams = await loadFamilies();
    const created = [];

    for (const cand of candidates) {
      const signalId = makeSignalId(c, cand);
      const exists = await rcmd("EXISTS", K.signal(signalId));
      if (exists) continue;

      const cdRaw = await rcmd("GET", K.cooldown(cand.symbol, cand.direction));
      if (cdRaw != null && cand.entryOpenTime - Number(cdRaw) < c.tfMs * 8) continue;

      const fp = `${cand.fingerprintBase}:${cand.symbol}`;
      const fpNew = await rcmd("SET", K.fingerprint(fp), signalId, "NX", "EX", TTL.fingerprint);
      if (fpNew !== "OK") continue;

      const fam = familyId(cand.direction, cand.setupType, cand.class);
      const famStat = fams[fam] || {};
      const record = {
        signalId, symbol: cand.symbol, direction: cand.direction,
        setupType: cand.setupType, class: cand.class, score: cand.score, scoreParts: cand.scoreParts,
        entry: cand.plan.entry, stopLoss: cand.plan.stop, tp1: cand.plan.tp1, tp2: cand.plan.tp2,
        riskDistance: cand.plan.distance, stopAtr: cand.plan.stopAtr,
        rrToTp1: cand.plan.rrToTp1, rrToTp2: cand.plan.rrToTp2,
        roomToStructureR: cand.plan.roomToStructureR,
        candleTime: cand.entryOpenTime, candleTimeIso: iso(cand.entryOpenTime),
        htfBias: cand.context?.htfBias ?? 0, regime: cand.context?.regime ?? null,
        structureBias: cand.context?.structureBias ?? 0,
        relativeVolume: cand.context?.relVol ?? null,
        volRank: cand.context?.volRank ?? null, erRank: cand.context?.erRank ?? null,
        tick: cand.tick, familyId: fam,
        familyStatusAtSignal: famStat.status || "COLLECTING",
        indicatorVersion: c.indicatorVersion, parameterVersion: c.parameterVersion,
        parameterHash: c.parameterHash, engineVersion: c.engineVersion,
        status: "OPEN", outcome: null, createdAt: Date.now(),
      };

      const [chain] = await appendChain([{ type: "OPEN", ts: record.createdAt, signalId, symbol: record.symbol, direction: record.direction, entry: record.entry, stopLoss: record.stopLoss, tp1: record.tp1, tp2: record.tp2, familyId: fam }]);
      record.previousRecordHash = chain.previousRecordHash;
      record.recordHash = chain.recordHash;

      await rpipe([
        ["SET", K.signal(signalId), JSON.stringify(record)],
        ["ZADD", K.byTime(), record.candleTime, signalId],
        ["SADD", K.open(), signalId],
        ["SET", K.cooldown(cand.symbol, cand.direction), cand.entryOpenTime, "EX", TTL.cooldown],
      ]);
      await openPosition(record);
      await bumpSeen(fam);
      created.push({ record, famStat });
    }

    const today = utcDate(Date.now());
    const already = Number((await rcmd("GET", K.pubCount(today))) || 0);
    let budget = Math.max(0, c.maxPubsPerDay - already);
    created.sort((a, b) => publishOrder(a.record, b.record, fams));

    let published = 0;
    for (const { record, famStat } of created) {
      if (budget <= 0) break;
      const ok = await publishSignal(record, famStat);
      if (ok) {
        budget--; published++;
        await rpipe([["INCR", K.pubCount(today)], ["EXPIRE", K.pubCount(today), TTL.pubCount]]);
        await rcmd("SET", K.signal(record.signalId), JSON.stringify({ ...record, published: true }));
      }
    }

    await rpipe([
      ["HSET", K.scanCycle(cycleId), "status", "FINALIZED", "completedAt", Date.now()],
      ["EXPIRE", K.scanCycle(cycleId), TTL.cycle],
    ]);
    log("info", "finalize", "done", { cycleId, candidates: candidates.length, created: created.length, published });
    return { status: completed < expected ? "PARTIAL" : "SUCCESS", cycleId, candidates: candidates.length, created: created.length, published };
  } finally {
    await releaseLock(`finalize:${cycleId}`, token);
  }
}
