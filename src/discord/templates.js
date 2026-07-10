import { priceStr } from "../utils/math.js";
import { cfg } from "../config.js";

const COLORS = {
  LONG: 0x22c55e, SHORT: 0xef4444, COLLECTING: 0xf59e0b,
  VERIFIED: 0x2dd4bf, LOST_EDGE: 0xfb7185, INFO: 0x64748b,
};

export function statusTag(fam) {
  if (!fam || !fam.status || fam.status === "COLLECTING") {
    return `COLLECTING ${fam?.completed ?? 0}/30`;
  }
  if (fam.status === "VERIFIED") {
    const ev = fam.avgNetR ?? 0;
    return `VERIFIED · EV ${ev >= 0 ? "+" : ""}${ev.toFixed(2)}R · n=${fam.completed}`;
  }
  return `${fam.status} · n=${fam.completed}`;
}

export function signalEmbed(s, fam) {
  const t = s.tick;
  const description = [
    `**${s.symbol} · 15M ${s.setupType}**`,
    "",
    `**ENTRY**\n${priceStr(s.entry, t)}`,
    `**STOP-LOSS**\n${priceStr(s.stopLoss, t)}`,
    `**TP1 · 1R**\n${priceStr(s.tp1, t)}`,
    `**TP2 · 2R**\n${priceStr(s.tp2, t)}`,
    "",
    `**4H TREND**\n${s.htfBias === 1 ? "BULL" : s.htfBias === -1 ? "BEAR" : "NEUTRAL"}`,
    `**REGIME**\n${s.regime ?? "—"}`,
    "",
    `**STATUS**\n${statusTag(fam)}`,
    `**SIGNAL ID**\n${s.signalId}`,
    "",
    `[Open volledig track record](${cfg().appUrl}/signal/${s.signalId})`,
  ].join("\n");
  return {
    embeds: [{
      title: `ARS-U · ${s.direction} ${s.class} · SCORE ${s.score}`,
      description,
      color: fam?.status === "VERIFIED" ? COLORS.VERIFIED : COLORS[s.direction],
      timestamp: new Date(s.candleTime).toISOString(),
      footer: { text: `${cfg().indicatorVersion} · ${cfg().parameterHash}` },
    }],
  };
}

export function digestEmbed(d) {
  const icon = (st) => (st === "VERIFIED" ? "🟢" : st === "LOST_EDGE" ? "🔴" : st === "COLLECTING" ? "⚪" : "🟡");
  const famLines = d.families
    .map((f) => `${icon(f.status)} \`${f.familyId.padEnd(22)}\` n=${f.completed} · avg ${f.avgNetR != null ? (f.avgNetR >= 0 ? "+" : "") + f.avgNetR.toFixed(2) + "R" : "—"} · ${f.status}`)
    .join("\n");
  const description = [
    `Nieuwe signalen: **${d.newSignals}** · Afgerond: **${d.closed}** · Netto dag: **${d.netR >= 0 ? "+" : ""}${d.netR.toFixed(2)}R**`,
    `Open posities: **${d.open}** · VERIFIED-families: **${d.verifiedCount}**`,
    "",
    "**Families**",
    famLines,
    "",
    `**Daily root hash** (tamper-evident)\n\`${d.manifest.dailyRootHash ?? "—"}\` · records: ${d.manifest.recordCount}`,
    "",
    `[Volledig track record](${cfg().appUrl}/track-record)`,
  ].join("\n");
  return { embeds: [{ title: `ARS-U Daily Digest · ${d.date}`, description, color: COLORS.INFO }] };
}

export function statusChangeEmbed(ch) {
  const toColor = ch.to === "VERIFIED" ? COLORS.VERIFIED : ch.to === "LOST_EDGE" ? COLORS.LOST_EDGE : COLORS.COLLECTING;
  const description = [
    `Familie \`${ch.familyId}\``,
    `Status: **${ch.from} → ${ch.to}**`,
    `n=${ch.n} · avg ${ch.avgNetR != null ? (ch.avgNetR >= 0 ? "+" : "") + ch.avgNetR.toFixed(2) + "R" : "—"} · LCB ${ch.lcb != null ? ch.lcb.toFixed(2) + "R" : "—"}`,
  ].join("\n");
  return { embeds: [{ title: "ARS-U · familie-statuswijziging", description, color: toColor, timestamp: new Date(ch.at).toISOString() }] };
}

export function statusEmbed(title, fields) {
  return {
    embeds: [{
      title,
      description: Object.entries(fields).map(([k, v]) => `**${k}**: ${v}`).join("\n"),
      color: COLORS.INFO,
      timestamp: new Date().toISOString(),
    }],
  };
}
