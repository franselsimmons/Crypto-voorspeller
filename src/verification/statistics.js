import { cfg } from "../config.js";
import { seededRng } from "../utils/prng.js";

export const OUTCOME_CATS = ["loss", "be", "full", "timeout"];

export function outcomeValues() {
  const cost = cfg().costR;
  return { loss: -1 - cost, be: 0.5 - cost, full: 1.5 - cost, timeout: 0 - cost };
}

/**
 * Multinomiale bootstrap-LCB voor gemiddelde netto R (FASE 0, optie B).
 * Shrinkage: p̂ = (counts + k·p_parent) / (n + k). Deterministisch geseed.
 */
export function bootstrapLcb(counts, parentProbs, familyKeySeed) {
  const c = cfg();
  const n = OUTCOME_CATS.reduce((s, k) => s + (counts[k] || 0), 0);
  if (n === 0) return { n: 0, mean: null, lcb: null, pValue: null };

  const vals = outcomeValues();
  const probs = OUTCOME_CATS.map((k) => ((counts[k] || 0) + c.kPrior * (parentProbs[k] || 0)) / (n + c.kPrior));
  const cum = [];
  probs.reduce((acc, p, i) => { cum[i] = acc + p; return cum[i]; }, 0);
  cum[cum.length - 1] = 1;

  const catVals = OUTCOME_CATS.map((k) => vals[k]);
  const empMean = OUTCOME_CATS.reduce((s, k, i) => s + (counts[k] || 0) * catVals[i], 0) / n;

  const rng = seededRng(`${familyKeySeed}:${n}:${OUTCOME_CATS.map((k) => counts[k] || 0).join(",")}`);
  const B = c.bootstrapB;
  const means = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const u = rng();
      let idx = 0;
      while (idx < cum.length - 1 && u > cum[idx]) idx++;
      sum += catVals[idx];
    }
    means[b] = sum / n;
  }
  means.sort();
  const lcb = means[Math.floor(0.05 * B)];
  let leq0 = 0;
  for (let b = 0; b < B; b++) if (means[b] <= 0) leq0++;
  const pValue = Math.max(leq0 / B, 1 / B);
  return { n, mean: empMean, lcb, pValue };
}

export function parentProbsFor(direction, familyStats) {
  const agg = { loss: 0, be: 0, full: 0, timeout: 0 };
  let total = 0;
  for (const [fid, f] of Object.entries(familyStats)) {
    if (!fid.startsWith(direction + ":")) continue;
    for (const k of OUTCOME_CATS) { agg[k] += f.counts?.[k] || 0; total += f.counts?.[k] || 0; }
  }
  if (total === 0) return { loss: 0.25, be: 0.25, full: 0.25, timeout: 0.25 };
  const out = {};
  for (const k of OUTCOME_CATS) out[k] = agg[k] / total;
  return out;
}
