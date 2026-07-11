import { cfg, FAMILY_IDS } from "../config.js";
import { rcmd, rpipe, jget } from "../storage/redis.js";
import { K } from "../storage/keys.js";
import { loadFamilies } from "../verification/familyEngine.js";
import { lastRun } from "../observability/runs.js";
import { getAllTickers } from "../market/bitgetClient.js";
import { currentCycleId, utcDate, iso } from "../utils/time.js";

const flatToObj = (arr) => {
  const o = {};
  for (let i = 0; i < (arr?.length || 0); i += 2) o[arr[i]] = arr[i + 1];
  return o;
};

export async function adminOverview() {
  const c = cfg();
  const today = utcDate(Date.now());
  const [uniRun, finRun, monRun, digRun] = await Promise.all([
    lastRun("UNIVERSE"), lastRun("FINALIZE"), lastRun("MONITOR"), lastRun("DIGEST"),
  ]);
  const scanRuns = await Promise.all(
    Array.from({ length: c.scanShards }, (_, i) => lastRun(`SCAN:${i}`))
  );
  const [universe, fams] = await Promise.all([jget(K.universe()), loadFamilies()]);
  const [measured, open, closed, pubToday, waitlist, discordRaw] = await rpipe([
    ["ZCARD", K.byTime()],
    ["SCARD", K.open()],
    ["ZCARD", K.closed()],
    ["GET", K.pubCount(today)],
    ["SCARD", K.waitlist()],
    ["LRANGE", K.discordLogs(), 0, 0],
  ]);

  let completedTotal = 0;
  const verified = [];
  for (const fid of FAMILY_IDS) {
    completedTotal += fams[fid].completed || 0;
    if (fams[fid].status === "VERIFIED") verified.push(fid);
  }
  const lastScan = scanRuns.filter(Boolean).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0] || null;
  const lastDiscord = discordRaw && discordRaw[0] ? JSON.parse(discordRaw[0]) : null;

  return {
    universe: { count: universe?.count ?? 0, updatedAt: universe?.ts ?? null },
    runs: {
      universe: uniRun, finalize: finRun, monitor: monRun, digest: digRun,
      lastShardScan: lastScan,
      shardStatuses: scanRuns.map((r, i) => ({ shard: i, status: r?.status ?? null, at: r?.completedAt ?? null })),
    },
    signals: {
      measured: Number(measured || 0),
      open: Number(open || 0),
      closedIndexed: Number(closed || 0),
      completedInFamilies: completedTotal,
      publishedToday: Number(pubToday || 0),
      maxPerDay: c.maxPubsPerDay,
    },
    verifiedFamilies: verified,
    waitlistCount: Number(waitlist || 0),
    discord: { lastPost: lastDiscord },
    system: {
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      namespace: c.namespace,
      collectingMode: c.collectingMode,
      paidLaunch: c.paidLaunch,
    },
  };
}

export async function scannerInfo() {
  const c = cfg();
  const cur = currentCycleId(c.tfMs);
  const cycles = [];
  for (const cy of [cur, cur - c.tfMs]) {
    const meta = flatToObj(await rcmd("HGETALL", K.scanCycle(cy)));
    const shardRaw = await rpipe(
      Array.from({ length: c.scanShards }, (_, i) => ["GET", K.scanShard(cy, i)])
    );
    const shards = shardRaw.map((r, i) => {
      if (!r) return { shard: i, present: false };
      const s = JSON.parse(r);
      return {
        shard: i, present: true, processed: s.processed, failed: s.failed,
        apiCalls: s.apiCalls, durationMs: s.durationMs,
        candidates: (s.candidates || []).length,
        top: (s.candidates || []).slice(0, 8).map((x) => ({
          symbol: x.symbol, direction: x.direction, setupType: x.setupType,
          class: x.class, score: x.score,
        })),
      };
    });
    cycles.push({ cycleId: cy, cycleIso: iso(cy), meta, shards });
  }
  return { shardsConfigured: c.scanShards, concurrency: c.scanConcurrency, cycles };
}

/** Adminlijst: als publieke lijst, plus published-filter en extra velden. */
export async function adminListSignals(q = {}) {
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
  const offset = Math.max(Number(q.cursor) || 0, 0);
  const CHUNK = 100, SCAN_CAP = 600;
  const items = [];
  let scanned = 0;
  let more = true;

  while (items.length < limit && scanned < SCAN_CAP) {
    const from = offset + scanned;
    const ids = (await rcmd("ZREVRANGE", K.byTime(), from, from + CHUNK - 1)) || [];
    if (!ids.length) { more = false; break; }
    const raws = await rpipe(ids.map((id) => ["GET", K.signal(id)]));
    for (const raw of raws) {
      scanned++;
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (q.direction && s.direction !== q.direction) continue;
      if (q.setupType && s.setupType !== q.setupType) continue;
      if (q.class && s.class !== q.class) continue;
      if (q.status && s.status !== q.status) continue;
      if (q.symbol && s.symbol !== String(q.symbol).toUpperCase()) continue;
      if (q.published === "yes" && !s.published) continue;
      if (q.published === "no" && s.published) continue;
      items.push({
        signalId: s.signalId, symbol: s.symbol, direction: s.direction,
        setupType: s.setupType, class: s.class, score: s.score,
        entry: s.entry, stopLoss: s.stopLoss, tp1: s.tp1, tp2: s.tp2, tick: s.tick,
        status: s.status, published: !!s.published, familyId: s.familyId,
        familyStatusAtSignal: s.familyStatusAtSignal, candleTime: s.candleTime,
        exitReason: s.outcome?.exitReason ?? null, netR: s.outcome?.netR ?? null,
        ambiguousBar: s.outcome?.ambiguousBar ?? false,
      });
      if (items.length >= limit) break;
    }
    if (ids.length < CHUNK && items.length < limit) { more = false; break; }
  }
  return { items, nextCursor: more ? offset + scanned : null, scanned };
}

export async function positionsDetail(includePrices = true) {
  const c = cfg();
  const ids = (await rcmd("SMEMBERS", K.open())) || [];
  if (!ids.length) return { count: 0, positions: [] };
  const raws = await rpipe(ids.map((id) => ["GET", K.position(id)]));

  const priceMap = {};
  if (includePrices) {
    try {
      for (const t of await getAllTickers()) priceMap[t.symbol] = t.last;
    } catch { /* prijzen optioneel: admin-view mag niet falen op Bitget-storing */ }
  }

  const now = Date.now();
  const positions = raws
    .filter(Boolean)
    .map((r) => {
      const p = JSON.parse(r);
      const dist = Math.abs(p.entry - p.stopLoss) || 1e-12;
      const last = priceMap[p.symbol] ?? null;
      const currentR = last == null ? null
        : Number(((p.direction === "LONG" ? last - p.entry : p.entry - last) / dist).toFixed(2));
      return {
        signalId: p.signalId, symbol: p.symbol, direction: p.direction, familyId: p.familyId,
        entry: p.entry, stopLoss: p.stopLoss, tp1: p.tp1, tp2: p.tp2, tp1Hit: !!p.tp1Hit,
        last, currentR,
        ageMinutes: Math.round((now - p.candleTime) / 60000),
        timeoutAtIso: iso(p.candleTime + c.timeoutMinutes * 60000),
      };
    })
    .sort((a, b) => b.ageMinutes - a.ageMinutes);
  return { count: positions.length, positions };
}

export async function familiesDetail() {
  const c = cfg();
  const fams = await loadFamilies();
  const logRaw = (await rcmd("LRANGE", K.familyStatusLog(), 0, 49)) || [];
  return {
    namespace: c.namespace,
    minCompleted: c.minTotalPerFamily,
    kPrior: c.kPrior,
    bootstrapB: c.bootstrapB,
    bhAlpha: c.bhAlpha,
    families: FAMILY_IDS.map((fid) => fams[fid]),
    statusLog: logRaw.map((x) => JSON.parse(x)),
  };
}

export async function discordLogsList(limit = 100) {
  const raw = (await rcmd("LRANGE", K.discordLogs(), 0, Math.min(limit, 100) - 1)) || [];
  return { logs: raw.map((x) => JSON.parse(x)) };
}

export async function exportAll() {
  const signals = [];
  let cursor = 0;
  for (let i = 0; i < 5; i++) {
    const page = await adminListSignals({ limit: 100, cursor });
    signals.push(...page.items);
    if (page.nextCursor == null) break;
    cursor = page.nextCursor;
  }
  const [fams, positions] = await Promise.all([familiesDetail(), positionsDetail(false)]);
  return {
    generatedAt: new Date().toISOString(),
    namespace: fams.namespace,
    counts: { signals: signals.length, openPositions: positions.count },
    families: fams.families,
    familyStatusLog: fams.statusLog,
    openPositions: positions.positions,
    signals,
  };
}
