export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { adminJson } from "../../../../src/site/adminRoute.js";
import { jget } from "../../../../src/storage/redis.js";
import { K } from "../../../../src/storage/keys.js";
import { HK } from "../../../../src/hrb/hrbKeys.js";
import { hrbCfg } from "../../../../src/hrb/config.js";
import { getCandles, closedOnly } from "../../../../src/market/bitgetClient.js";
import { analyzeHrbWindow } from "../../../../src/hrb/hrbEngine.js";
import { mapLimit } from "../../../../src/utils/pool.js";
import { iso } from "../../../../src/utils/time.js";

const TF_MS = 15 * 60 * 1000;

/** Terugblik-diagnose voor HRB — zelfde idee als ARS-U's diagnose, alleen-lezen. */
async function probe(symbol, barsWanted) {
  const c = hrbCfg();
  const raw = closedOnly(await getCandles(symbol, "15m", c.candleLimit), TF_MS);
  const maxLb = Math.min(barsWanted, raw.length - c.warmupBars);
  if (maxLb < 1) return { symbol, status: "INSUFFICIENT_HISTORY", hits: [], barsChecked: 0 };
  const hits = [];
  for (let j = raw.length - maxLb; j < raw.length; j++) {
    const win = raw.slice(0, j + 1);
    const a = analyzeHrbWindow(win, { mode: "triggers" });
    if (!a.ok || (!a.candidateLong && !a.candidateShort)) continue;
    const b = analyzeHrbWindow(win, { mode: "full", tick: 1e-8 });
    const uitkomst = [];
    if (!b.ok) uitkomst.push(`ENGINE_ERROR · ${b.reason || "?"}`);
    else {
      const sig = b.signalLong || b.signalShort;
      if (sig) uitkomst.push(`SIGNAL · ${sig.side} ${sig.class} · pressure ${sig.pressure?.toFixed?.(0) ?? "?"}`);
      else for (const bl of (b.blockedInfo || [])) uitkomst.push(`BLOCKED · ${bl}`);
    }
    hits.push({ t: iso(win[win.length - 1].ts), long: a.candidateLong, short: a.candidateShort, uitkomst });
  }
  return { symbol, status: "OK", barsChecked: maxLb, hits };
}

export async function GET(req) {
  return adminJson(req, async () => {
    const started = Date.now();
    const p = new URL(req.url).searchParams;
    const bars = Math.min(64, Math.max(8, Number(p.get("bars")) || 32));
    const universe = (await jget(K.universe())) || (await jget(HK.universe()));
    if (!universe?.symbols?.length) return { error: "universe ontbreekt" };
    const symbols = universe.symbols.map((x) => x.s).slice(0, 60);

    const results = await mapLimit(symbols, 4, (sym) => probe(sym, bars));
    const agg = { coins: 0, triggersLong: 0, triggersShort: 0, signalen: 0, geblokkeerd: {}, barsTotaal: 0 };
    const details = [];
    for (const r of results) {
      if (!r.ok) continue;
      const v = r.value; agg.coins++; agg.barsTotaal += v.barsChecked;
      for (const h of v.hits) {
        if (h.long) agg.triggersLong++;
        if (h.short) agg.triggersShort++;
        for (const u of h.uitkomst) {
          if (u.startsWith("SIGNAL")) agg.signalen++;
          else if (u.startsWith("BLOCKED")) { const key = u.slice("BLOCKED · ".length); agg.geblokkeerd[key] = (agg.geblokkeerd[key] || 0) + 1; }
        }
      }
      if (v.hits.length && details.length < 30) details.push({ symbol: v.symbol, hits: v.hits });
    }
    const trig = agg.triggersLong + agg.triggersShort;
    const conclusie = trig === 0
      ? `0 Band-triggers in ${agg.barsTotaal} bar-evaluaties over ${agg.coins} coins in dit venster.`
      : agg.signalen > 0
        ? `HRB keurt setups goed: ${agg.signalen} signa(a)l(en) + ${trig} Band-triggers. HPE bevestigt dus een deel.`
        : `${trig} Band-triggers maar 0 door HPE bevestigd — de HPE-drempel houdt alles tegen in dit venster.`;
    return { conclusie, samenvatting: agg, details, durationMs: Date.now() - started };
  });
}
