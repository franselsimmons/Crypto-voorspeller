import { NextResponse } from "next/server";

import { buildAnalytics } from "@/lib/analytics";
import { getTradeEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const events = await getTradeEvents();
    const analytics = buildAnalytics(events);

    return NextResponse.json({
      ok: true,
      count: events.length,
      events,
      analytics,
      ts: Date.now()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "UNKNOWN_TRADES_GET_ERROR",
        ts: Date.now()
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    {
      ok: false,
      error: "CLEAR_TRADE_EVENTS_DISABLED",
      reason:
        "clearTradeEvents is niet beschikbaar in '@/lib/store'. DELETE is uitgezet zodat de build niet faalt.",
      ts: Date.now()
    },
    { status: 501 }
  );
}