import { cfg, FAMILY_IDS } from "../config.js";
import { rcmd, rpipe, jget } from "../storage/redis.js";
import { K } from "../storage/keys.js";
import { loadFamilies } from "../verification/familyEngine.js";
import { lastRun } from "../observability/runs.js";
import { dailyManifest } from "../storage/hashChain.js";
import { utcDate } from "../utils/time.js";

const clampInt = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : def;
};

/** Compacte lijstprojectie — nooit volledige records naar de browser. */
const LIST_FIELDS = (s) => ({
  signalId: s.signalId, symbol: s.symbol, direction: s.direction,
  setupType: s.setupType, class: s.class, score: s.score,
  entry: s.entry, stopLoss: s.stopLoss, tp1: s.tp1, tp2: s.tp2, tick: s.tick,
  status: s.status, published: !!s.published, familyId: s.familyId,
  candleTime: s.candleTime, indicatorVersion: s.indicatorVersion,
  result: s.outcome?.exitReason ?? null,
  grossR: s.outcome?.grossR ?? null, costR: s.outcome?.costR ?? null,
  netR: s.outcome?.netR ?? null,
  durationMinutes: s.outcome?.durationMinutes ?? null,
});

export async function getOverview() {
  const c = cfg();
  const [universe, fams, seen, open, closed] = await Promise.all([
    jget(K.universe()),
    loadFamilies(),
    rcmd("ZCARD", K.byTime()),
    rcmd("SCARD", K.open()),
    rcmd("ZCARD", K.closed()),
  ]);
  let totalNetR = 0, completed = 0;
  const verifiedFamilies = [];
  for (const fid of FAMILY_IDS) {
    const f = fams[fid];
    totalNetR += f.netR || 0;
    completed += f.completed || 0;
    if (f.status === "VERIFIED") verifiedFamilies.push(fid);
  }
  return {
    phase: c.collectingMode ? "COLLECTING" : "LIVE",
    paidLaunch: c.paidLaunch,
    monthlyPriceEur: c.monthlyPriceEur,
    coinsTracked: universe?.count ?? 0,
    universeUpdatedAt: universe?.ts ?? null,
    signalsMeasured: Number(seen || 0),
    signalsOpen: Number(open || 0),
    signalsCompleted: completed,
    signalsClosed: Number(closed || 0),
    totalNetR: Number(totalNetR.toFixed(2)),
    verifiedCount: verifiedFamilies.length,
    verifiedFamilies,
    indicatorVersion: c.indicatorVersion,
    parameterHash: c.parameterHash,
  };
}

export async function getRecentSignals({ limit = 8, onlyPublished = false } = {}) {
  const scanCap = onlyPublished ? 80 : limit;
  const ids = (await rcmd("ZREVRANGE", K.byTime(), 0, scanCap - 1)) || [];
  if (!ids.length) return [];
  const raws = await rpipe(ids.map((id) => ["GET", K.signal(id)]));
  const out = [];
  for (const raw of raws) {
    if (!raw) continue;
    const s = JSON.parse(raw);
    if (onlyPublished && !s.published) continue;
    out.push(LIST_FIELDS(s));
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Gefilterde, gepagineerde lijst. Cursor = offset in tijd-aflopende index;
 * per request max 600 records gescand (documented cap, zie A8).
 */
export async function listSignals(q = {}) {
  const limit = clampInt(q.limit, 1, 100, 50);
  const offset = clampInt(q.cursor, 0, 1e9, 0);
  const CHUNK = 100, SCAN_CAP = 600;
  const dateFrom = q.dateFrom ? Date.parse(`${q.dateFrom}T00:00:00Z`) : null;
  const dateTo = q.dateTo ? Date.parse(`${q.dateTo}T23:59:59Z`) : null;
  const symbol = q.symbol ? String(q.symbol).toUpperCase() : null;

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
      if (q.familyId && s.familyId !== q.familyId) continue;
      if (q.status && s.status !== q.status) continue;
      if (symbol && s.symbol !== symbol) continue;
      if (dateFrom != null && s.candleTime < dateFrom) continue;
      if (dateTo != null && s.candleTime > dateTo) continue;
      if (q.result === "win" && !(s.outcome?.netR > 0)) continue;
      if (q.result === "loss" && !(s.outcome?.netR < 0)) continue;
      items.push(LIST_FIELDS(s));
      if (items.length >= limit) break;
    }
    if (ids.length < CHUNK && items.length < limit) { more = false; break; }
  }
  return { items, nextCursor: more ? offset + scanned : null, scanned };
}

export const getSignal = (signalId) => jget(K.signal(String(signalId)));

export async function getFamilyList() {
  const c = cfg();
  const fams = await loadFamilies();
  return {
    namespace: c.namespace,
    minCompleted: c.minTotalPerFamily,
    bhAlpha: c.bhAlpha,
    families: FAMILY_IDS.map((fid) => fams[fid]),
  };
}

export async function getStatusInfo() {
  const [uni, fin, mon, dig, universe, open] = await Promise.all([
    lastRun("UNIVERSE"), lastRun("FINALIZE"), lastRun("MONITOR"), lastRun("DIGEST"),
    jget(K.universe()), rcmd("SCARD", K.open()),
  ]);
  const c = cfg();
  const now = Date.now();
  const finAge = fin?.completedAt ? now - fin.completedAt : null;
  const uniAge = universe?.ts ? now - universe.ts : null;
  let health = "OK";
  if (finAge == null || finAge > 90 * 60000) health = "DOWN";
  else if (finAge > 25 * 60000 || uniAge == null || uniAge > 3 * 3600000) health = "DEGRADED";
  const manifest = await dailyManifest(utcDate(now - 86400000));
  return {
    health,
    lastUniverse: uni ? { status: uni.status, at: uni.completedAt } : null,
    lastFinalize: fin ? { status: fin.status, at: fin.completedAt } : null,
    lastMonitor: mon ? { status: mon.status, at: mon.completedAt } : null,
    lastDigest: dig ? { status: dig.status, at: dig.completedAt } : null,
    universeCount: universe?.count ?? 0,
    openPositions: Number(open || 0),
    indicatorVersion: c.indicatorVersion,
    parameterHash: c.parameterHash,
    engineVersion: c.engineVersion,
    yesterdayManifest: manifest,
  };
}

export async function getDaily(date) {
  const d = date || utcDate(Date.now() - 86400000);
  const [digest, dates] = await Promise.all([
    jget(K.daily(d)),
    rcmd("ZREVRANGE", K.dailyIndex(), 0, 13),
  ]);
  return { date: d, digest, availableDates: dates || [] };
}
