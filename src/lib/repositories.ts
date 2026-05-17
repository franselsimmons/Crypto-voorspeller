import { sql } from "./db";
import type {
  NormalizedWebhookEvent,
  NormalizedEntry,
  NormalizedExit,
  NormalizedReject
} from "./normalize";

type AnyRecord = Record<string, any>;

function jsonb(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function toDateIso(value?: string | Date | null): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

export async function insertWebhookEvent(event: NormalizedWebhookEvent) {
  const rows = await sql`
    INSERT INTO webhook_events (
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
      ${jsonb(event.payload)}::jsonb,
      ${event.payloadHash}
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;

  return {
    inserted: Array.isArray(rows) && rows.length > 0,
    deduped: Array.isArray(rows) && rows.length === 0
  };
}

export async function insertTradeEntry(
  event: NormalizedWebhookEvent,
  entry: NormalizedEntry
) {
  await sql`
    INSERT INTO trade_entries (
      event_id,
      trade_id,
      created_at,
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
      ${event.eventId},
      ${entry.tradeId},
      ${toDateIso()},
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

      ${jsonb(event.payload)}::jsonb
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

export async function insertTradeExit(
  event: NormalizedWebhookEvent,
  exit: NormalizedExit
) {
  await sql`
    INSERT INTO trade_exits (
      event_id,
      trade_id,
      created_at,
      source,
      strategy_version,
      run_id,
      symbol,
      side,
      cohort_key,

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
      ${event.eventId},
      ${exit.tradeId || event.tradeId},
      ${toDateIso()},
      ${event.source},
      ${event.strategyVersion},
      ${event.runId},
      ${exit.symbol},
      ${exit.side},
      ${event.cohortKey},

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

      ${jsonb(event.payload)}::jsonb
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

export async function insertTradeReject(
  event: NormalizedWebhookEvent,
  reject: NormalizedReject
) {
  await sql`
    INSERT INTO trade_rejects (
      event_id,
      created_at,
      source,
      strategy_version,
      run_id,
      symbol,
      side,
      cohort_key,

      reject_reason,
      action,

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
      ${toDateIso()},
      ${event.source},
      ${event.strategyVersion},
      ${event.runId},
      ${reject.symbol},
      ${reject.side},
      ${reject.cohortKey},

      ${reject.rejectReason},
      ${reject.action},

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

      ${jsonb(event.payload)}::jsonb
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

export async function saveNormalizedEvent(event: NormalizedWebhookEvent) {
  const webhookResult = await insertWebhookEvent(event);

  if (webhookResult.deduped) {
    return {
      ok: true,
      deduped: true,
      eventId: event.eventId,
      eventType: event.eventType
    };
  }

  if (event.eventType === "ENTRY" && event.entry) {
    await insertTradeEntry(event, event.entry);
  }

  if (event.eventType === "EXIT" && event.exit) {
    await insertTradeExit(event, event.exit);
  }

  if (event.eventType === "REJECT" && event.reject) {
    await insertTradeReject(event, event.reject);
  }

  return {
    ok: true,
    deduped: false,
    eventId: event.eventId,
    eventType: event.eventType
  };
}

export async function getRecentTradeRows(limit = 250) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 250, 1000));

  const rows = await sql`
    SELECT
      'ENTRY' AS event_type,
      event_id,
      trade_id,
      created_at,
      symbol,
      side,
      cohort_key,
      entry_price,
      NULL::numeric AS exit_price,
      tp_price,
      sl_price,
      NULL::numeric AS pnl_pct,
      NULL::numeric AS exit_r,
      NULL::text AS exit_reason,
      final_rr,
      confluence,
      sniper_score,
      rsi,
      regime,
      flow,
      spread_bps,
      depth_usd_1p
    FROM trade_entries

    UNION ALL

    SELECT
      'EXIT' AS event_type,
      event_id,
      trade_id,
      created_at,
      symbol,
      side,
      cohort_key,
      entry_price,
      exit_price,
      tp_price,
      sl_price,
      pnl_pct,
      exit_r,
      exit_reason,
      NULL::numeric AS final_rr,
      NULL::numeric AS confluence,
      NULL::numeric AS sniper_score,
      NULL::numeric AS rsi,
      NULL::text AS regime,
      NULL::text AS flow,
      NULL::numeric AS spread_bps,
      NULL::numeric AS depth_usd_1p
    FROM trade_exits

    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return Array.isArray(rows) ? rows : [];
}

export async function getEntryRows(limit = 5000) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 50000));

  const rows = await sql`
    SELECT *
    FROM trade_entries
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return Array.isArray(rows) ? rows : [];
}

export async function getExitRows(limit = 5000) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 50000));

  const rows = await sql`
    SELECT *
    FROM trade_exits
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return Array.isArray(rows) ? rows : [];
}

export async function getRejectRows(limit = 5000) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 50000));

  const rows = await sql`
    SELECT *
    FROM trade_rejects
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return Array.isArray(rows) ? rows : [];
}