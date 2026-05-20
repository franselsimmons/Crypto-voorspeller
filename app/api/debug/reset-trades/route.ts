import { NextRequest, NextResponse } from "next/server";
import { clearTradeEvents, getTradeEventCount, hasRedis } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FALLBACK_SECRET = "090117";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || "";
  const expectedSecret = process.env.RESET_TRADES_SECRET || FALLBACK_SECRET;

  if (secret !== expectedSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      { status: 401 }
    );
  }

  const before = await getTradeEventCount();
  const result = await clearTradeEvents();
  const after = await getTradeEventCount();

  return NextResponse.json({
    ok: true,
    route: "reset-trades-cleared",
    cleared: true,
    persistent: result.persistent,
    redis: hasRedis(),
    before,
    after
  });
}