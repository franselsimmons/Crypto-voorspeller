export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { cfg } from "../../../../src/config.js";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { jget } from "../../../../src/storage/redis.js";
import { K } from "../../../../src/storage/keys.js";
import { getCandles, closedOnly } from "../../../../src/market/bitgetClient.js";
import { getHtfSeries } from "../../../../src/market/htfContext.js";
import { analyzeWindow } from "../../../../src/indicator/arsEngine.js";
import { mapLimit } from "../../../../src/utils/pool.js";
import { iso } from "../../../../src/utils/time.js";

/**
 * F7 · Terugblik-diagnose. Herspeelt de laatste `bars` gesloten 15m-candles per
 * coin door exact dezelfde engine-functies als de live-scanner (geen logica
 * gedupliceerd) en rapporteert per trigger wat ermee gebeurde.
 * Alleen-lezen: geen Redis-writes, geen invloed op de draaiende keten.
 * Eerlijke kanttekening: terugblik-vensters hebben iets méér linkerhistorie dan
 * de live-scan destijds had; randgevallen kunnen daardoor minimaal verschillen.
 */
function classify(side, passB) {
  const sig = side === "LONG" ? passB.signalLong : passB.signalShort;
  if (sig) return `SIGNAL · ${side} ${sig.setupType} · score ${Math.round(sig.score.total)} (${sig.score.cls})`;
  const bl = (passB.blockedInfo || []).find((x) => x.startsWith(side));
  if (bl) return `BLOCKED · ${bl}`;
  return `${side} · trigger zonder kwalificatie (score < 80 of vervolgbar)`;
}

async function probeSymbol(symbol, barsWanted) {
  const c = cfg();
  const raw = closedOnly(await getCandles(symbol, "15m", c.candleLimit), c.tfMs);
  const maxLb = Math.min(barsWanted, raw.length - c.warmupBars);
  if (maxLb < 1) return { symbol, status: "INSUFFICIENT_HISTORY", bars: raw.length, hits: [], barsChecked: 0 };

  let htfMap = null;
  let htfLoaded = false;
  const hits = [];

  for (let j = raw.length - maxLb; j < raw.length; j++) {
    const win = raw.slice(0, j + 1);
    const passA = analyzeWindow(win, { mode: "triggers" });
    if (!passA.ok || (!passA.candidateLong && !passA.candidateShort)) continue;

    if (!htfLoaded) {
      htfMap = await getHtfSeries(symbol); // 1 extra fetch, alleen bij een echte trigger
      htfLoaded = true;
    }
    const passB = analyzeWindow(win, { mode: "full", htfMap, tick: 1e-8 });
    const uitkomst = [];
    if (!passB.ok) {
      uitkomst.push(`ENGINE_ERROR · ${passB.reason || "onbekend"}`);
    } else {
      if (passA.candidateLong) uitkomst.push(classify("LONG", passB));
      if (passA.candidateShort) uitkomst.push(classify("SHORT", passB));
    }
    hits.push({
      t: iso(win[win.length - 1].ts),
      long: passA.candidateLong,
      short: passA.candidateShort,
      uitkomst,
    });
  }
  return { symbol, status: "OK", barsChecked: maxLb, hits };
}

function verdict(a) {
  const trig = a.triggersLong + a.triggersShort;
  if (trig === 0) {
    return {
      conclusie: `0 triggers in ${a.barsTotaal} bar-evaluaties over ${a.coins} coins — de triggerlaag vuurde in dit venster helemaal niet.`,
      advies: "Draai dit 2-3× op verschillende momenten en probeer ?bars=64 (16 uur). Blijft het overal 0, dan splitsen we de triggercomponenten uit met een vervolgbestand — dan zien we welke voorwaarde alles tegenhoudt.",
    };
  }
  if (a.signalen > 0) {
    return {
      conclusie: `De motor keurt wél setups goed: ${a.signalen} signa(a)l(en) plus ${trig} triggers in de terugblik.`,
      advies: "Vergelijk de tijdstippen met de live-cycli (Admin → Scanner). Miste live die momenten, dan zit het verschil in de live-keten en duik ik daarin. Zo niet: de machine is gewoon kieskeurig én gezond.",
    };
  }
  const blockedTotal = Object.values(a.geblokkeerd).reduce((s, v) => s + v, 0);
  if (blockedTotal >= a.triggerZonderKwalificatie && blockedTotal > 0) {
    const top = Object.entries(a.geblokkeerd).sort((x, y) => y[1] - x[1])[0];
    return {
      conclusie: `Motor leeft: ${trig} triggers, 0 gekwalificeerd — vaakste blokkade: "${top[0]}" (${top[1]}×).`,
      advies: "Die poort houdt alles tegen. Stuur een screenshot van deze uitkomst; dan beoordelen we samen of die poort terecht zo streng is of een fout bevat.",
    };
  }
  return {
    conclusie: `Motor leeft en evalueert: ${trig} triggers, geen dominante blokkades, maar niets haalt score ≥ 80.`,
    advies: "Volgende stap is score-inzicht: een kleine engine-uitbreiding die per trigger de exacte score toont. Zeg het, dan lever ik dat bestand.",
  };
}

export async function GET(req) {
  return adminJson(req, async () => {
    const started = Date.now();
    const p = new URL(req.url).searchParams;
    const bars = Math.min(64, Math.max(8, Number(p.get("bars")) || 32));

    const universe = await jget(K.universe());
    if (!universe?.symbols?.length) {
      return { error: "universe ontbreekt — draai eerst Admin → Tools → Run universe" };
    }
    const symbols = universe.symbols.map((x) => x.s).slice(0, 60);

    const results = await mapLimit(symbols, 4, (sym) => probeSymbol(sym, bars));

    const agg = {
      coins: 0, coinsMislukt: 0, coinsZonderTrigger: 0, barsTotaal: 0,
      triggersLong: 0, triggersShort: 0, signalen: 0,
      geblokkeerd: {}, triggerZonderKwalificatie: 0,
    };
    const details = [];
    for (const r of results) {
      if (!r.ok) { agg.coinsMislukt++; continue; }
      const v = r.value;
      agg.coins++;
      agg.barsTotaal += v.barsChecked;
      if (!v.hits.length) { agg.coinsZonderTrigger++; continue; }
      for (const h of v.hits) {
        if (h.long) agg.triggersLong++;
        if (h.short) agg.triggersShort++;
        for (const u of h.uitkomst) {
          if (u.startsWith("SIGNAL")) agg.signalen++;
          else if (u.startsWith("BLOCKED")) {
            const key = u.slice("BLOCKED · ".length);
            agg.geblokkeerd[key] = (agg.geblokkeerd[key] || 0) + 1;
          } else if (u.includes("trigger zonder kwalificatie")) {
            agg.triggerZonderKwalificatie++;
          }
        }
      }
      if (details.length < 30) details.push({ symbol: v.symbol, hits: v.hits });
    }

    const { conclusie, advies } = verdict(agg);
    return {
      conclusie, advies,
      samenvatting: { ...agg, urenTeruggekeken: Number(((agg.barsTotaal / Math.max(agg.coins, 1)) / 4).toFixed(1)) },
      details,
      letOp: "Terugblik-vensters hebben iets langere historie dan live-scans hadden; randgevallen kunnen minimaal verschillen. Alleen-lezen diagnose — beïnvloedt niets.",
      durationMs: Date.now() - started,
    };
  });
}
