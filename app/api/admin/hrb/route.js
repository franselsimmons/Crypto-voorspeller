export const dynamic = "force-dynamic";

import { adminJson } from "../../../../src/site/adminRoute.js";
import { hrbCfg, HRB_FAMILY_IDS } from "../../../../src/hrb/config.js";
import { rcmd, rpipe } from "../../../../src/storage/redis.js";
import { HK } from "../../../../src/hrb/hrbKeys.js";
import { loadHrbFamilies } from "../../../../src/hrb/hrbFamilyEngine.js";
import { lastRun } from "../../../../src/observability/runs.js";

/** Admin-overzicht van het HRB-systeem: families, tellingen, laatste runs. */
export async function GET(req) {
  return adminJson(req, async () => {
    const c = hrbCfg();
    const [fams, measured, open, closed, scanRun, finRun, monRun] = await Promise.all([
      loadHrbFamilies(),
      rcmd("ZCARD", HK.byTime()), rcmd("SCARD", HK.open()), rcmd("ZCARD", HK.closed()),
      lastRun("HRB_SCAN"), lastRun("HRB_FINALIZE"), lastRun("HRB_MONITOR"),
    ]);
    let totalNetR = 0, completedTotal = 0;
    const families = HRB_FAMILY_IDS.map((fid) => {
      const f = fams[fid];
      totalNetR += f.netR || 0; completedTotal += f.completed || 0;
      return {
        familyId: fid, status: f.status, seen: f.seen, open: f.open, completed: f.completed,
        counts: f.counts, avgNetR: f.avgNetR, lcb: f.lcb, pValue: f.pValue, fdrPass: f.fdrPass,
        winrate: f.winrate, profitFactor: f.profitFactor, maxDrawdownR: f.maxDrawdownR,
        last30AvgR: f.last30AvgR, verifiedAt: f.verifiedAt, lostEdgeAt: f.lostEdgeAt,
      };
    });
    return {
      namespace: c.namespace, indicatorVersion: c.indicatorVersion,
      minCompleted: c.minTotalPerFamily, bhAlpha: c.bhAlpha,
      signals: { measured: Number(measured || 0), open: Number(open || 0), closed: Number(closed || 0), completedInFamilies: completedTotal },
      totalNetR: Number(totalNetR.toFixed(2)),
      runs: {
        scan: scanRun ? { status: scanRun.status, at: scanRun.completedAt, candidates: scanRun.candidates } : null,
        finalize: finRun ? { status: finRun.status, at: finRun.completedAt } : null,
        monitor: monRun ? { status: monRun.status, at: monRun.completedAt } : null,
      },
      families,
    };
  });
}
