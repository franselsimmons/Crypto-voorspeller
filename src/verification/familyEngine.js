import { cfg, FAMILY_IDS } from "../config.js";
import { rcmd, rpipe } from "../storage/redis.js";
import { K } from "../storage/keys.js";
import { bootstrapLcb, parentProbsFor, OUTCOME_CATS, outcomeValues } from "./statistics.js";
import { benjaminiHochberg } from "./fdr.js";
import { postStatusChange } from "../discord/discord.js";

function emptyFamily(fid) {
  return {
    familyId: fid, seen: 0, open: 0, completed: 0,
    counts: { loss: 0, be: 0, full: 0, timeout: 0 },
    wins: 0, losses: 0, tp1Be: 0, tp2: 0, timeouts: 0,
    grossR: 0, netR: 0, cum: 0, peak: 0, maxDrawdownR: 0, currentDrawdownR: 0,
    bestStreak: 0, worstStreak: 0, streak: 0, lastR: [],
    status: "COLLECTING", verifiedAt: null, lostEdgeAt: null,
    avgGrossR: null, avgNetR: null, medianR: null, profitFactor: null,
    winrate: null, positiveRate: null, last30AvgR: null, last50AvgR: null,
    lcb: null, pValue: null, fdrPass: false,
  };
}

const famKey = (fid) => K.family(cfg().namespace, fid);

export async function loadFamilies() {
  const raw = await rpipe(FAMILY_IDS.map((fid) => ["GET", famKey(fid)]));
  const out = {};
  FAMILY_IDS.forEach((fid, i) => { out[fid] = raw[i] ? JSON.parse(raw[i]) : emptyFamily(fid); });
  return out;
}

export async function bumpSeen(fid) {
  const f = JSON.parse((await rcmd("GET", famKey(fid))) || "null") || emptyFamily(fid);
  f.seen++; f.open++;
  await rcmd("SET", famKey(fid), JSON.stringify(f));
}

export async function recordClose(fid, outcome) {
  const f = JSON.parse((await rcmd("GET", famKey(fid))) || "null") || emptyFamily(fid);
  f.open = Math.max(0, f.open - 1);
  f.completed++;
  f.counts[outcome.category] = (f.counts[outcome.category] || 0) + 1;
  f.grossR += outcome.grossR;
  f.netR += outcome.netR;
  f.cum += outcome.netR;
  f.peak = Math.max(f.peak, f.cum);
  f.currentDrawdownR = Number((f.peak - f.cum).toFixed(4));
  f.maxDrawdownR = Math.max(f.maxDrawdownR, f.currentDrawdownR);
  const win = outcome.netR > 0;
  f.streak = win ? Math.max(1, f.streak + 1) : Math.min(-1, f.streak - 1);
  f.bestStreak = Math.max(f.bestStreak, f.streak);
  f.worstStreak = Math.min(f.worstStreak, f.streak);
  f.lastR.push(Number(outcome.netR.toFixed(4)));
  if (f.lastR.length > 50) f.lastR.shift();
  f.wins = f.counts.be + f.counts.full;
  f.losses = f.counts.loss;
  f.tp1Be = f.counts.be;
  f.tp2 = f.counts.full;
  f.timeouts = f.counts.timeout;
  await rcmd("SET", famKey(fid), JSON.stringify(f));
  return f;
}

export async function recomputeAllFamilies() {
  const c = cfg();
  const fams = await loadFamilies();
  const vals = outcomeValues();

  for (const fid of FAMILY_IDS) {
    const f = fams[fid];
    const n = f.completed;
    if (n > 0) {
      f.avgGrossR = Number((f.grossR / n).toFixed(4));
      f.avgNetR = Number((f.netR / n).toFixed(4));
      const sorted = [...f.lastR].sort((a, b) => a - b);
      f.medianR = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
      const gw = f.counts.be * vals.be + f.counts.full * vals.full;
      const gl = Math.abs(f.counts.loss * vals.loss + f.counts.timeout * vals.timeout);
      f.profitFactor = gl > 0 ? Number((gw / gl).toFixed(3)) : gw > 0 ? 99 : null;
      f.winrate = Number(((f.wins / n) * 100).toFixed(2));
      f.positiveRate = f.winrate;
      const lastN = (k) => {
        const arr = f.lastR.slice(-k);
        return arr.length ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(4)) : null;
      };
      f.last30AvgR = lastN(30);
      f.last50AvgR = lastN(50);
      const parent = parentProbsFor(fid.split(":")[0], fams);
      const bs = bootstrapLcb(f.counts, parent, `${c.namespace}:${fid}`);
      f.lcb = bs.lcb != null ? Number(bs.lcb.toFixed(4)) : null;
      f.pValue = bs.pValue;
    }
  }

  const passSet = benjaminiHochberg(
    FAMILY_IDS.map((fid) => ({ id: fid, p: fams[fid].completed >= c.minTotalPerFamily ? fams[fid].pValue : null })),
    c.bhAlpha
  );

  const changes = [];
  for (const fid of FAMILY_IDS) {
    const f = fams[fid];
    f.fdrPass = passSet.has(fid);
    const prev = f.status;
    let next;
    if (f.completed < c.minTotalPerFamily) next = prev === "VERIFIED" || prev === "LOST_EDGE" ? prev : "COLLECTING";
    else if (f.avgNetR == null || f.avgNetR <= 0) next = prev === "VERIFIED" ? "LOST_EDGE" : "INSUFFICIENT_EDGE";
    else if (f.lcb != null && f.lcb > 0 && f.fdrPass) next = "VERIFIED";
    else next = prev === "VERIFIED" ? "LOST_EDGE" : "CANDIDATE";

    if (next === "VERIFIED" && prev !== "VERIFIED") f.verifiedAt = Date.now();
    if (next === "LOST_EDGE" && prev === "VERIFIED") f.lostEdgeAt = Date.now();
    if (next !== prev) changes.push({ familyId: fid, from: prev, to: next, at: Date.now(), n: f.completed, avgNetR: f.avgNetR, lcb: f.lcb });
    f.status = next;
  }

  const cmds = FAMILY_IDS.map((fid) => ["SET", famKey(fid), JSON.stringify(fams[fid])]);
  for (const ch of changes) cmds.push(["LPUSH", K.familyStatusLog(), JSON.stringify(ch)]);
  cmds.push(["LTRIM", K.familyStatusLog(), 0, 199]);
  await rpipe(cmds);

  for (const ch of changes) await postStatusChange(ch);
  return { families: fams, changes };
}
