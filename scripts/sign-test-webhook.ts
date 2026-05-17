import crypto from "node:crypto";

const webhookUrl =
  process.env.WEBHOOK_URL || "http://localhost:3000/api/webhooks/tradesystem";

const secret =
  process.env.WEBHOOK_SECRET_CURRENT ||
  process.env.WEBHOOK_SECRET ||
  process.env.TRADE_WEBHOOK_SECRET ||
  "";

if (!secret) {
  console.error("WEBHOOK_SECRET_CURRENT ontbreekt.");
  process.exit(1);
}

function signPayload(rawBody: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${rawBody}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

function entryPayload() {
  const tradeId = `TEST_${Date.now()}`;

  return {
    v: "DS_METRICS_V1",
    eventId: `entry_${tradeId}`,
    type: "ENTRY",
    tradeId,

    symbol: "TEST",
    side: "bull",
    cohortKey:
      "SETUP=GOD|SIDE=bull|REASON=GOD_ENTRY|RSI=MID|EDGE=RSI_CONTINUATION|FLOW=TREND|BTC=NEUTRAL|OB=NEUTRAL|CONF_95_100|SNIPER_85_90|RR_1P25_1P50|SPREAD_8_12BPS|DEPTH_100K_200K",

    setup: {
      setupClass: "GOD",
      entryReason: "GOD_ENTRY",
      grade: "A",
      gradePoints: 14
    },

    scores: {
      score: 80,
      confluence: 96,
      rawConfluence: 93,
      sniperScore: 87,
      rawSniperScore: 21,
      fallbackSniperScore: 87
    },

    rr: {
      baseRR: 1.18,
      finalRr: 1.475,
      requiredRR: 1.18,
      finalRequiredRR: 1.45,
      tpRewardMultiplier: 1.25
    },

    price: {
      entry: 10.0655,
      sl: 9.839026,
      tp: 10.399549
    },

    rsi: {
      rsi: 45.08,
      rsiHTF: 45.08,
      rsiZone: "MID",
      rsiEdge: "RSI_CONTINUATION",
      rsiEdgeRank: 0,
      continuationOk: true,
      continuationScore: 0,
      slope3: 0,
      confBonus: 3,
      rrDiscount: 0.05,
      sniperDiscount: 2
    },

    market: {
      btcState: "NEUTRAL",
      regime: "MID_VOL",
      flow: "TREND",
      tfStrength: 3,
      tfAlignment: "BULLISH",
      change1h: 0,
      change24: 0,
      funding: 0,
      fundingBucket: "FUNDING_NEUTRAL"
    },

    ob: {
      bias: "NEUTRAL",
      relation: "NEUTRAL",
      spreadPct: 0.000894,
      spreadBps: 8.94,
      spreadBucket: "SPREAD_8_12BPS",
      maxSpreadAllowed: 0.0008,
      depthMinUsd1p: 109287.22,
      depthBucket: "DEPTH_100K_200K",
      spoof: false
    },

    structure: {
      pullbackConfirmed: false,
      sweepConfirmed: false,
      retestConfirmed: false,
      distanceFromLocalHighPct: 0.02692
    },

    gates: {
      qualityGateReason: "V12_QUALITY_OK",
      finalDepthReason: "OK",
      confirmationRequired: false,
      confirmationSeen: false
    }
  };
}

function exitPayload(tradeId: string) {
  return {
    v: "DS_OUTCOME_V1",
    eventId: `exit_${tradeId}`,
    type: "EXIT",
    tradeId,

    symbol: "TEST",
    side: "bull",
    cohortKey:
      "SETUP=GOD|SIDE=bull|REASON=GOD_ENTRY|RSI=MID|EDGE=RSI_CONTINUATION|FLOW=TREND|BTC=NEUTRAL|OB=NEUTRAL|CONF_95_100|SNIPER_85_90|RR_1P25_1P50|SPREAD_8_12BPS|DEPTH_100K_200K",

    outcome: {
      exitReason: "SL",
      exitR: -1.088,
      pnlPct: -2.449,
      triggerR: -1.088,
      triggerPnlPct: -2.449,
      holdMinutes: 0
    },

    price: {
      entry: 10.0655,
      exit: 9.819,
      trigger: 9.819,
      tp: 10.399549,
      sl: 9.839026
    },

    path: {
      mfeR: 0,
      maeR: -1.088,
      currentR: -1.088,
      maxTpProgress: 0,
      maxSlProgress: 0,
      reachedHalfR: false,
      reachedOneR: false,
      nearTpSeen: false,
      directToSL: false,
      slAfterHalfR: false,
      slAfterOneR: false,
      slAfterNearTp: false
    },

    be: {
      breakEvenActivated: false,
      breakEvenStop: false,
      breakEvenSl: null
    }
  };
}

async function post(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tradesystem-signature": signature,
      "x-signature": signature,
      "x-webhook-signature": signature
    },
    body: rawBody
  });

  const text = await res.text();

  console.log("Status:", res.status);
  console.log(text);
}

async function main() {
  const mode = process.argv[2] || "entry";
  const entry = entryPayload();

  if (mode === "entry") {
    await post(entry);
    return;
  }

  if (mode === "exit") {
    await post(exitPayload(entry.tradeId));
    return;
  }

  if (mode === "both") {
    await post(entry);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await post(exitPayload(entry.tradeId));
    return;
  }

  console.error("Gebruik: npm run webhook:test -- entry | exit | both");
  process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});