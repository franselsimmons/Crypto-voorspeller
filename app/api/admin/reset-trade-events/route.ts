import { clearTradeEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expected = process.env.TRADE_RESET_SECRET;

  if (!expected) return false;

  const headerSecret = request.headers.get("x-reset-secret");
  return headerSecret === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      {
        status: 401
      }
    );
  }

  await clearTradeEvents();

  return Response.json({
    ok: true,
    reset: true,
    message: "Trade events cleared"
  });
}