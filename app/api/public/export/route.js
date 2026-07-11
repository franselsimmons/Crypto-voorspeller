export const dynamic = "force-dynamic";
import { listSignals } from "../../../../src/site/queries.js";

const COLS = ["date", "symbol", "direction", "setupType", "class", "score", "entry", "stopLoss", "tp1", "tp2", "status", "result", "grossR", "costR", "netR", "durationMinutes", "indicatorVersion", "signalId"];
const esc = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req) {
  try {
    const p = new URL(req.url).searchParams;
    const maxRows = Math.min(Math.max(Number(p.get("rows")) || 500, 1), 1000);
    const filters = {
      direction: p.get("direction") || undefined,
      setupType: p.get("setupType") || undefined,
      class: p.get("class") || undefined,
      familyId: p.get("familyId") || undefined,
      status: p.get("status") || undefined,
      symbol: p.get("symbol") || undefined,
      dateFrom: p.get("dateFrom") || undefined,
      dateTo: p.get("dateTo") || undefined,
      result: p.get("result") || undefined,
    };
    const rows = [];
    let cursor = 0;
    for (let i = 0; i < 10 && rows.length < maxRows; i++) {
      const page = await listSignals({ ...filters, limit: 100, cursor });
      rows.push(...page.items);
      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    }
    const lines = [COLS.join(",")];
    for (const r of rows.slice(0, maxRows)) {
      lines.push(COLS.map((c) => esc(c === "date" ? new Date(r.candleTime).toISOString() : r[c])).join(","));
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ars-track-record.csv"`,
        "Cache-Control": "public, s-maxage=300",
      },
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
