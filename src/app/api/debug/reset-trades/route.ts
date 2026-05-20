import { NextResponse } from "next/server";
import { clearTradeEvents } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSecret(req: Request): string {
  const url = new URL(req.url);

  return (
    url.searchParams.get("secret") ||
    req.headers.get("x-reset-secret") ||
    ""
  );
}

function assertResetSecret(req: Request): NextResponse | null {
  const expected = process.env.TRADE_RESET_SECRET || "";
  const received = getSecret(req);

  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "TRADE_RESET_SECRET_MISSING"
      },
      { status: 500 }
    );
  }

  if (received !== expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      { status: 401 }
    );
  }

  return null;
}

async function resetTrades(req: Request) {
  const unauthorized = assertResetSecret(req);

  if (unauthorized) return unauthorized;

  const result = await clearTradeEvents();

  return NextResponse.json(
    {
      ok: true,
      reset: true,
      persistent: result.persistent,
      message: "TRADE_EVENTS_CLEARED"
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function GET(req: Request) {
  return resetTrades(req);
}

export async function POST(req: Request) {
  return resetTrades(req);
}