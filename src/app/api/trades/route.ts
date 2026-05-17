import { NextResponse } from "next/server";
import { getTradeEvents, clearTradeEvents } from "@/lib/store";
import { buildAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getTradeEvents();
  const analytics = buildAnalytics(events);

  return NextResponse.json({
    ok: true,
    count: events.length,
    events,
    analytics
  });
}

export async function DELETE() {
  const result = await clearTradeEvents();

  return NextResponse.json(result);
}