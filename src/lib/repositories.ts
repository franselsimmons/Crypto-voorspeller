import { sql } from "./db";
import type { NormalizedWebhookEvent, NormalizedEntry, NormalizedExit, NormalizedReject } from "./normalize";

export async function insertRawEvent(event: NormalizedWebhookEvent): Promise<{
  inserted: boolean;
}> {
  const rows = await sql`
    INSERT INTO raw_events (
      event_id,
      event_type,
      source,
      strategy_version,
      run_id,
      trade_id,
      symbol,
      side,
      cohort_key,
      payload,
      payload_hash
    )
    VALUES (
      ${event.eventId},
      ${event.eventType},
      ${event.source},
      ${event.strategyVersion},
      ${event.runId},
      ${event.tradeId},
      ${event.symbol},
      ${event.side},
      ${event.cohortKey},
      ${sql.json(event.payload)},
      ${event.payloadHash}
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id
  `;

  return { inserted: rows.length > 0 };
}

export async function insertEntry(event: NormalizedWebhookEvent, entry: NormalizedEntry): Promise<void> {
  await sql`
    INSERT INTO trade_entries (
      trade_id,
      event_id,
      source,
      strategy_version,
      run_id,

      symbol,
      side,
      cohort_key,

      setup_class,
      entry_reason,
      grade,
      grade_points,

      entry_price,
      tp_price,
      sl_price,

      base_rr,
      final_rr,
      required_rr,
      final_required_rr,
      tp_reward_multiplier,

      scanner_score,
      confluence,
      raw_confluence,
      sniper_score,
      raw_sniper_score,
      fallback_sniper_score,

      rsi,
      rsi_htf,
      rsi_zone,
      rsi_edge,
      continuation_ok,

      btc_state,
      regime,
      flow,
      tf_strength,
      tf_alignment,

      ob_bias,
      ob_relation,
      spread_pct,
      spread_bps,
      spread_bucket,
      depth_usd_1p,
      depth_bucket,
      spoof,

      funding,
      funding_bucket,

      pullback_confirmed,
      sweep_confirmed,
      retest_confirmed,
      distance_from_local_high_pct,

      quality_gate_reason,
      final_depth_reason,
      confirmation_required,
      confirmation_seen,

      raw_payload
    )
    VALUES (
      ${entry.tradeId},
      ${event.eventId},
      ${event.source},
      ${event.strategyVersion},
      ${event.runId},

      ${entry.symbol},
      ${entry.side},
      ${entry.cohortKey},

      ${entry.setupClass},
      ${entry.entryReason},
      ${entry.grade},
      ${entry.gradePoints},

      ${entry.entryPrice},
      ${entry.tpPrice},
      ${entry.slPrice},

      ${entry.baseRR},
      ${entry.finalRR},
      ${entry.requiredRR},
      ${entry.finalRequiredRR},
      ${entry.tpRewardMultiplier},

      ${entry.scannerScore},
      ${entry.confluence},
      ${entry.rawConfluence},
      ${entry.sniperScore},
      ${entry.rawSniperScore},
      ${entry.fallbackSniperScore},

      ${entry.rsi},
      ${entry.rsiHTF},
      ${entry.rsiZone},
      ${entry.rsiEdge},
      ${entry.continuationOk},

      ${entry.btcState},
      ${entry.regime},
      ${entry.flow},
      ${entry.tfStrength},
      ${entry.tfAlignment},

      ${entry.obBias},
      ${entry.obRelation},
      ${entry.spreadPct},
      ${entry.spreadBps},
      ${entry.spreadBucket},
      ${entry.depthUsd1p},
      ${entry.depthBucket},
      ${entry.spoof},

      ${entry.funding},
      ${entry.fundingBucket},

      ${entry.pullbackConfirmed},
      ${entry.sweepConfirmed},
      ${entry.retestConfirmed},
      ${entry.distanceFromLocalHighPct},

      ${entry.qualityGateReason},
      ${entry.finalDepthReason},
      ${entry.confirmationRequired},
      ${entry.confirmationSeen},

      ${sql.json(event.payload)}
    )
    ON CONFLICT (trade_id) DO UPDATE SET
      event_id = COALESCE(trade_entries.event_id, EXCLUDED.event_id),
      cohort_key = EXCLUDED.cohort_key,
      raw_payload = EXCLUDED.raw_payload
  `;
}

async function resolveExitTradeId(exit: NormalizedExit): Promise<string | null> {
  if (exit.tradeId) return exit.tradeId;

  if (exit.entryPrice !== null) {
    const exact = await sql<{ trade_id: string }[]>`
      SELECT trade_id
      FROM trade_entries
      WHERE symbol = ${exit.symbol}
        AND side = ${exit.side}
        AND status = 'OPEN'
        AND entry_price = ${exit.entryPrice}
      ORDER BY opened_at DESC
      LIMIT 1
    `;

    if (exact[0]?.trade_id) return exact[0].trade_id;
  }

  const latest = await sql<{ trade_id: string }[]>`
    SELECT trade_id
    FROM trade_entries
    WHERE symbol = ${exit.symbol}
      AND side = ${exit.side}
      AND status = 'OPEN'
    ORDER BY opened_at DESC
    LIMIT 1
  `;

  return latest[0]?.trade_id ?? null;
}

export async function insertExit(event: NormalizedWebhookEvent, exit: NormalizedExit): Promise<{
  tradeId: string | null;
  linked: boolean;
}> {
  const tradeId = await resolveExitTradeId(exit);

  if (!tradeId) {
    return { tradeId: null, linked: false };
  }

  await sql`
    INSERT INTO trade_exits (
      trade_id,
      event_id,

      symbol,
      side,

      exit_reason,
      exit_r,
      pnl_pct,
      trigger_r,
      trigger_pnl_pct,
      hold_minutes,

      entry_price,
      exit_price,
      trigger_price,
      tp_price,
      sl_price,

      mfe_r,
      mae_r,
      current_r,
      max_tp_progress,
      max_sl_progress,

      direct_to_sl,
      reached_half_r,
      reached_one_r,
      near_tp_seen,
      sl_after_half_r,
      sl_after_one_r,
      sl_after_near_tp,

      break_even_activated,
      break_even_stop,

      raw_payload
    )
    VALUES (
      ${tradeId},
      ${event.eventId},

      ${exit.symbol},
      ${exit.side},

      ${exit.exitReason},
      ${exit.exitR},
      ${exit.pnlPct},
      ${exit.triggerR},
      ${exit.triggerPnlPct},
      ${exit.holdMinutes},

      ${exit.entryPrice},
      ${exit.exitPrice},
      ${exit.triggerPrice},
      ${exit.tpPrice},
      ${exit.slPrice},

      ${exit.mfeR},
      ${exit.maeR},
      ${exit.currentR},
      ${exit.maxTpProgress},
      ${exit.maxSlProgress},

      ${exit.directToSL},
      ${exit.reachedHalfR},
      ${exit.reachedOneR},
      ${exit.nearTpSeen},
      ${exit.slAfterHalfR},
      ${exit.slAfterOneR},
      ${exit.slAfterNearTp},

      ${exit.breakEvenActivated},
      ${exit.breakEvenStop},

      ${sql.json(event.payload)}
    )
    ON CONFLICT (event_id) DO NOTHING
  `;

  await sql`
    UPDATE trade_entries
    SET status = 'CLOSED',
        closed_at = now()
    WHERE trade_id = ${tradeId}
  `;

  return { tradeId, linked: true };
}

export async function insertReject(event: NormalizedWebhookEvent, reject: NormalizedReject): Promise<void> {
  await sql`
    INSERT INTO trade_rejects (
      event_id,
      source,
      strategy_version,
      run_id,

      symbol,
      side,
      reject_reason,
      action,
      cohort_key,

      scanner_score,
      confluence,
      sniper_score,
      base_rr,
      final_rr,

      rsi,
      rsi_zone,
      rsi_edge,

      btc_state,
      regime,
      flow,

      ob_bias,
      ob_relation,
      spread_bps,
      depth_usd_1p,
      depth_bucket,

      would_entry,
      would_tp,
      would_sl,

      shadow_eligible,
      raw_payload
    )
    VALUES (
      ${event.eventId},
      ${event.source},
      ${event.strategyVersion},
      ${event.runId},

      ${reject.symbol},
      ${reject.side},
      ${reject.rejectReason},
      ${reject.action},
      ${reject.cohortKey},

      ${reject.scannerScore},
      ${reject.confluence},
      ${reject.sniperScore},
      ${reject.baseRR},
      ${reject.finalRR},

      ${reject.rsi},
      ${reject.rsiZone},
      ${reject.rsiEdge},

      ${reject.btcState},
      ${reject.regime},
      ${reject.flow},

      ${reject.obBias},
      ${reject.obRelation},
      ${reject.spreadBps},
      ${reject.depthUsd1p},
      ${reject.depthBucket},

      ${reject.wouldEntry},
      ${reject.wouldTp},
      ${reject.wouldSl},

      ${reject.shadowEligible},
      ${sql.json(event.payload)}
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

export async function insertSnapshot(event: NormalizedWebhookEvent): Promise<void> {
  await sql`
    INSERT INTO filter_snapshots (
      event_id,
      strategy_version,
      run_id,
      snapshot
    )
    VALUES (
      ${event.eventId},
      ${event.strategyVersion},
      ${event.runId},
      ${sql.json(event.payload)}
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

export async function saveNormalizedEvent(event: NormalizedWebhookEvent): Promise<{
  ok: boolean;
  deduped?: boolean;
  eventType: string;
  tradeId: string | null;
  linkedExit?: boolean;
}> {
  const raw = await insertRawEvent(event);

  if (!raw.inserted) {
    return {
      ok: true,
      deduped: true,
      eventType: event.eventType,
      tradeId: event.tradeId
    };
  }

  if (event.eventType === "ENTRY" && event.entry) {
    await insertEntry(event, event.entry);
    return {
      ok: true,
      eventType: event.eventType,
      tradeId: event.entry.tradeId
    };
  }

  if (event.eventType === "EXIT" && event.exit) {
    const result = await insertExit(event, event.exit);
    return {
      ok: true,
      eventType: event.eventType,
      tradeId: result.tradeId,
      linkedExit: result.linked
    };
  }

  if (event.eventType === "REJECT" && event.reject) {
    await insertReject(event, event.reject);
    return {
      ok: true,
      eventType: event.eventType,
      tradeId: null
    };
  }

  if (event.eventType === "SNAPSHOT") {
    await insertSnapshot(event);
    return {
      ok: true,
      eventType: event.eventType,
      tradeId: event.tradeId
    };
  }

  return {
    ok: true,
    eventType: event.eventType,
    tradeId: event.tradeId
  };
}