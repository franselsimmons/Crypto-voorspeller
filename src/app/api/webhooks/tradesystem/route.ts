import { NextRequest, NextResponse } from "next/server";
import { normalizeWebhookBody } from "@/lib/normalize";
import { saveNormalizedEvent } from "@/lib/repositories";
import { verifyWebhookSignature } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signatureResult = verifyWebhookSignature({
    rawBody,
    timestampHeader: req.headers.get("x-trade-timestamp"),
    signatureHeader: req.headers.get("x-trade-signature")
  });

  if (!signatureResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: signatureResult.reason
      },
      { status: 401 }
    );
  }

  try {
    const event = normalizeWebhookBody(rawBody);
    const result = await saveNormalizedEvent(event);

    return NextResponse.json(
      {
        ok: true,
        ...result
      },
      { status: result.deduped ? 200 : 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

    console.error("WEBHOOK_INGEST_ERROR", message);

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
    route: "/api/webhooks/tradesystem",
    accepts: ["ENTRY", "EXIT", "REJECT", "SNAPSHOT"]
  });
}