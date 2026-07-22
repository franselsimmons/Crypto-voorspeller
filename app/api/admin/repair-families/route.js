export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { cfg, FAMILY_IDS } from "../../../../src/config.js";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { rcmd, rpipe } from "../../../../src/storage/redis.js";
import { K } from "../../../../src/storage/keys.js";
import { loadFamilies, bumpSeen, recordClose, recomputeAllFamilies } from "../../../../src/verification/familyEngine.js";

const CATS = ["loss", "be", "full", "timeout"];

/** Grondwaarheid: de signaalrecords zelf (dedupe-veilig opgeslagen per signalId). */
async function groundTruth() {
  const ids = (await rcmd("ZRANGE", K.byTime(), 0, -1)) || [];
  const raws = ids.length ? await rpipe(ids.map((id) => ["GET", K.signal(id)])) : [];
  const signals = raws.filter(Boolean).map((r) => JSON.parse(r));
  const per = {};
  for (const fid of FAMILY_IDS) {
    per[fid] = { seen: 0, open: 0, completed: 0, counts: { loss: 0, be: 0, full: 0, timeout: 0 }, netR: 0 };
  }
  for (const s of signals) {
    const f = per[s.familyId];
    if (!f) continue;
    f.seen++;
    if (s.status === "CLOSED" && s.outcome?.category) {
      f.completed++;
      f.counts[s.outcome.category] = (f.counts[s.outcome.category] || 0) + 1;
      f.netR = Number((f.netR + (s.outcome.netR || 0)).toFixed(4));
    } else {
      f.open++;
    }
  }
  return { signals, per };
}

export async function GET(req) {
  return adminJson(req, async () => {
    const c = cfg();
    const confirm = new URL(req.url).searchParams.get("confirm") === "REBUILD";
    const before = await loadFamilies();
    const { signals, per } = await groundTruth();

    const vergelijk = FAMILY_IDS.map((fid) => {
      const gt = per[fid];
      const cur = before[fid];
      const match =
        gt.seen === cur.seen &&
        gt.completed === cur.completed &&
        CATS.every((k) => gt.counts[k] === (cur.counts?.[k] || 0));
      return {
        familyId: fid,
        opgeslagen: { seen: cur.seen, open: cur.open, completed: cur.completed, counts: cur.counts },
        grondwaarheid: gt,
        oordeel: match ? "KLOPT" : "AFWIJKING",
      };
    });
    const afwijkingen = vergelijk.filter((v) => v.oordeel === "AFWIJKING").length;

    if (!confirm) {
      return {
        modus: "DRY-RUN — er is niets gewijzigd",
        conclusie: afwijkingen === 0
          ? "Alle familietellers kloppen exact met de signaalrecords. Geen reparatie nodig; de metingen waren echt."
          : `${afwijkingen} van de 8 families wijken af van de grondwaarheid (echo's van F10). Voeg ?confirm=REBUILD toe aan deze link om te herstellen.`,
        totaalSignalen: signals.length,
        signalen: signals.slice(0, 50).map((s) => ({
          id: s.signalId, symbol: s.symbol, familyId: s.familyId, status: s.status,
          exit: s.outcome?.exitReason ?? null, netR: s.outcome?.netR ?? null, candleTime: s.candleTimeIso,
        })),
        vergelijk,
      };
    }

    // REBUILD: familie-keys leegmaken en herspelen via de échte productie-functies
    // (bumpSeen/recordClose/recomputeAllFamilies) — geen gedupliceerde logica, dus
    // gegarandeerd dezelfde semantiek. Idempotent: twee keer draaien geeft hetzelfde.
    await rpipe(FAMILY_IDS.map((fid) => ["DEL", K.family(c.namespace, fid)]));
    const creates = [...signals].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const s of creates) await bumpSeen(s.familyId);
    const closes = signals
      .filter((s) => s.status === "CLOSED" && s.outcome?.category)
      .sort((a, b) => (a.outcome.closedAt || 0) - (b.outcome.closedAt || 0));
    for (const s of closes) await recordClose(s.familyId, s.outcome);
    await recomputeAllFamilies();
    const after = await loadFamilies();

    return {
      modus: "REBUILD UITGEVOERD",
      totaalSignalen: signals.length,
      herspeeld: { aangemaakt: creates.length, afgerond: closes.length },
      voor: FAMILY_IDS.map((fid) => ({ familyId: fid, completed: before[fid].completed, netR: before[fid].netR })),
      na: FAMILY_IDS.map((fid) => ({
        familyId: fid, seen: after[fid].seen, open: after[fid].open,
        completed: after[fid].completed, netR: after[fid].netR, status: after[fid].status,
      })),
      letOp: "De hashketen blijft ongewijzigd (append-only principe): eventuele dubbele CLOSE-records blijven staan als eerlijk litteken van bug F10.",
    };
  });
}
