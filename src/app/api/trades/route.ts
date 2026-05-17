import { NextResponse } from "next/server";

import { buildAnalytics } from "@/lib/analytics";
import { clearTradeEvents, getTradeEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getTradeEvents();
  const analytics = buildAnalytics(events);

  return NextResponse.json({
    ok: true,
    events,
    analytics
  });
}

export async function DELETE() {
  const result = await clearTradeEvents();

  return NextResponse.json(result);
}