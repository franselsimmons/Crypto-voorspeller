import { NextResponse } from "next/server";

import { buildAnalytics } from "@/lib/analytics";
import { clearTradeEventsForDebugOnly, listTradeEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const events = await listTradeEvents();
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
  try {
    const result = await clearTradeEventsForDebugOnly();

    return NextResponse.json({
      ok: true,
      cleared: true,
      persistent: result.persistent,
      ts: Date.now()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "UNKNOWN_TRADES_DELETE_ERROR",
        ts: Date.now()
      },
      { status: 500 }
    );
  }
}