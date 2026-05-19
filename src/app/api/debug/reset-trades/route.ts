import { NextRequest, NextResponse } from "next/server";

import { clearTradeEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_SECRET =
  process.env.RESET_SECRET ||
  process.env.ANALYSIS_WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET ||
  process.env.TRADE_WEBHOOK_SECRET ||
  "";

function readSecret(req: NextRequest): string {
  const bearer = req.headers.get("authorization") || "";

  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return (
    req.headers.get("x-reset-secret") ||
    req.headers.get("x-webhook-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    ""
  ).trim();
}

function isAuthorized(req: NextRequest): boolean {
  if (!RESET_SECRET) return true;
  return readSecret(req) === RESET_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      { status: 401 }
    );
  }

  const result = await clearTradeEvents();

  return NextResponse.json({
    ok: true,
    reset: true,
    persistent: result.persistent,
    ts: Date.now()
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      { status: 401 }
    );
  }

  const result = await clearTradeEvents();

  return NextResponse.json({
    ok: true,
    reset: true,
    persistent: result.persistent,
    ts: Date.now()
  });
}