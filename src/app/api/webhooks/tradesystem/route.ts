import { NextRequest, NextResponse } from "next/server";
import { ingestTradeSystemEvent } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    const result = await ingestTradeSystemEvent(payload);

    return NextResponse.json(result, {
      status: result.deduped ? 200 : 202
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "tradesystem-webhook",
    methods: ["POST"],
    usage: "Send TradeSystem ENTRY / EXIT payloads to this endpoint."
  });
}