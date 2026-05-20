import { NextRequest, NextResponse } from "next/server";
import { clearTradeEvents, getTradeEventCount, hasRedis } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || "";
  const expectedSecret = process.env.RESET_TRADES_SECRET || "";

  if (!expectedSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "RESET_TRADES_SECRET_MISSING"
      },
      { status: 500 }
    );
  }

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
    route: "root-app-api-debug-reset-trades-cleared",
    cleared: true,
    persistent: result.persistent,
    redis: hasRedis(),
    before,
    after
  });
}