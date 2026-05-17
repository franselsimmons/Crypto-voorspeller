-- ================= TRADE OPTIMIZER DATABASE SCHEMA =================
-- PostgreSQL / Neon / Supabase compatible.
-- Run with: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================= WEBHOOK EVENT STORE =================

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id        text PRIMARY KEY,
  event_type      text NOT NULL,
  trade_id        text,
  source          text NOT NULL DEFAULT 'tradesystem',
  payload_hash    text NOT NULL,
  raw_payload     jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'RECEIVED',
  error_message   text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_trade_id
  ON webhook_events (trade_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type_status
  ON webhook_events (event_type, status);

-- ================= TRADE ENTRIES =================

CREATE TABLE IF NOT EXISTS trade_entries (
  trade_id        text PRIMARY KEY,
  event_id        text UNIQUE,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  source          text NOT NULL DEFAULT 'tradesystem',
  strategy_id     text NOT NULL DEFAULT 'default',
  strategy_version text NOT NULL DEFAULT 'v1',

  symbol          text NOT NULL,
  side            text NOT NULL,
  cohort_key      text NOT NULL DEFAULT 'NA',

  setup_class     text,
  grade           text,
  entry_reason    text,
  grade_points    numeric(10,4),

  scanner_score   numeric(10,4),
  confluence_score numeric(10,4),
  raw_confluence  numeric(10,4),
  sniper_score    numeric(10,4),
  raw_sniper_score numeric(10,4),
  fallback_sniper_score numeric(10,4),

  entry_price     numeric(28,12),
  tp_price        numeric(28,12),
  sl_price        numeric(28,12),

  base_rr         numeric(12,6),
  final_rr        numeric(12,6),
  required_rr     numeric(12,6),
  final_required_rr numeric(12,6),
  tp_reward_multiplier numeric(12,6),

  rsi             numeric(12,6),
  rsi_htf         numeric(12,6),
  rsi_zone        text,
  rsi_edge        text,
  rsi_edge_rank   numeric(12,6),
  continuation_ok boolean,
  continuation_score numeric(12,6),
  slope_3         numeric(12,6),
  conf_bonus      numeric(12,6),
  rr_discount     numeric(12,6),
  sniper_discount numeric(12,6),

  btc_state       text,
  regime          text,
  flow            text,
  tf_strength     numeric(12,6),
  tf_alignment    text,
  change_1h       numeric(12,6),
  change_24h      numeric(12,6),
  funding         numeric(18,10),
  funding_bucket  text,

  ob_bias         text,
  ob_relation     text,
  spread_pct      numeric(18,10),
  spread_bps      numeric(12,6),
  spread_bucket   text,
  max_spread_allowed numeric(18,10),
  depth_usd_1p    numeric(28,8),
  depth_bucket    text,
  spoof           boolean,

  pullback_confirmed boolean,
  sweep_confirmed    boolean,
  retest_confirmed   boolean,
  distance_from_local_high_pct numeric(18,10),

  quality_gate_reason text,
  final_depth_reason  text,
  confirmation_required boolean,
  confirmation_seen     boolean,

  filter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trade_entries_opened_at
  ON trade_entries (opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_symbol_opened
  ON trade_entries (symbol, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_side_opened
  ON trade_entries (side, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_cohort_opened
  ON trade_entries (cohort_key, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_setup_grade
  ON trade_entries (setup_class, grade, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_market_filters
  ON trade_entries (regime, flow, btc_state, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_ob_filters
  ON trade_entries (ob_relation, spread_bucket, depth_bucket, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_rsi_filters
  ON trade_entries (rsi_zone, rsi_edge, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_filter_snapshot_gin
  ON trade_entries USING gin (filter_snapshot jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_trade_entries_raw_payload_gin
  ON trade_entries USING gin (raw_payload jsonb_path_ops);

-- ================= TRADE EXITS =================

CREATE TABLE IF NOT EXISTS trade_exits (
  exit_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text UNIQUE,
  trade_id        text NOT NULL,
  closed_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  source          text NOT NULL DEFAULT 'tradesystem',

  symbol          text NOT NULL,
  side            text NOT NULL,
  cohort_key      text,

  exit_reason     text NOT NULL,
  exit_r          numeric(14,6),
  pnl_pct         numeric(14,6),
  trigger_r       numeric(14,6),
  trigger_pnl_pct numeric(14,6),
  hold_minutes    numeric(14,4),

  entry_price     numeric(28,12),
  exit_price      numeric(28,12),
  trigger_price   numeric(28,12),
  tp_price        numeric(28,12),
  sl_price        numeric(28,12),

  mfe_r           numeric(14,6),
  mae_r           numeric(14,6),
  current_r       numeric(14,6),
  max_tp_progress numeric(14,6),
  max_sl_progress numeric(14,6),

  reached_half_r  boolean,
  reached_one_r   boolean,
  near_tp_seen    boolean,
  direct_to_sl    boolean,
  sl_after_half_r boolean,
  sl_after_one_r  boolean,
  sl_after_near_tp boolean,

  break_even_activated boolean,
  break_even_stop      boolean,
  break_even_sl        numeric(28,12),

  outcome_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trade_exits_trade_id_closed
  ON trade_exits (trade_id, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_exits_closed_at
  ON trade_exits (closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_exits_symbol_closed
  ON trade_exits (symbol, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_exits_reason
  ON trade_exits (exit_reason, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_exits_r
  ON trade_exits (exit_r);

CREATE INDEX IF NOT EXISTS idx_trade_exits_path_flags
  ON trade_exits (direct_to_sl, near_tp_seen, reached_half_r, reached_one_r);

CREATE INDEX IF NOT EXISTS idx_trade_exits_outcome_snapshot_gin
  ON trade_exits USING gin (outcome_snapshot jsonb_path_ops);

-- ================= REJECTED / MISSED SETUPS =================

CREATE TABLE IF NOT EXISTS trade_rejects (
  reject_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text UNIQUE,
  rejected_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  source          text NOT NULL DEFAULT 'tradesystem',

  symbol          text NOT NULL,
  side            text NOT NULL,
  reason_code     text NOT NULL,
  cohort_key      text NOT NULL DEFAULT 'NA',

  would_entry_price numeric(28,12),
  would_tp_price    numeric(28,12),
  would_sl_price    numeric(28,12),

  setup_class     text,
  grade           text,
  scanner_score   numeric(10,4),
  confluence_score numeric(10,4),
  sniper_score    numeric(10,4),

  regime          text,
  flow            text,
  btc_state       text,
  rsi_zone        text,
  rsi_edge        text,
  ob_relation     text,
  spread_bucket   text,
  depth_bucket    text,

  filter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trade_rejects_rejected_at
  ON trade_rejects (rejected_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_rejects_symbol
  ON trade_rejects (symbol, rejected_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_rejects_reason
  ON trade_rejects (reason_code, rejected_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_rejects_cohort
  ON trade_rejects (cohort_key, rejected_at DESC);

-- ================= PARAMETER RUNS / OPTIMIZER =================

CREATE TABLE IF NOT EXISTS param_runs (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  name            text NOT NULL,
  strategy_version text NOT NULL DEFAULT 'v1',

  objective_mode  text NOT NULL DEFAULT 'BALANCED',
  params          jsonb NOT NULL DEFAULT '{}'::jsonb,

  from_ts         timestamptz,
  to_ts           timestamptz,

  trades          integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,

  winrate         numeric(12,6),
  wilson_lower    numeric(12,6),
  total_r         numeric(14,6),
  avg_r           numeric(14,6),
  pnl_pct         numeric(14,6),
  profit_factor   numeric(14,6),
  max_drawdown_r  numeric(14,6),

  score           numeric(14,6),
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_param_runs_created
  ON param_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_param_runs_score
  ON param_runs (score DESC);

CREATE INDEX IF NOT EXISTS idx_param_runs_params_gin
  ON param_runs USING gin (params jsonb_path_ops);

-- ================= COHORT SNAPSHOTS =================

CREATE TABLE IF NOT EXISTS cohort_snapshots (
  snapshot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  cohort_key      text NOT NULL,
  strategy_version text NOT NULL DEFAULT 'v1',

  trades          integer NOT NULL DEFAULT 0,
  closed          integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,

  winrate         numeric(12,6),
  wilson_lower    numeric(12,6),
  total_r         numeric(14,6),
  avg_r           numeric(14,6),
  pnl_pct         numeric(14,6),
  profit_factor   numeric(14,6),

  direct_sl_pct   numeric(12,6),
  near_tp_pct     numeric(12,6),
  be_pct          numeric(12,6),

  snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cohort_snapshots_cohort_created
  ON cohort_snapshots (cohort_key, created_at DESC);

-- ================= USEFUL VIEW =================

CREATE OR REPLACE VIEW v_trade_joined AS
SELECT
  e.*,
  x.closed_at,
  x.exit_reason,
  x.exit_r,
  x.pnl_pct,
  x.trigger_r,
  x.trigger_pnl_pct,
  x.hold_minutes,
  x.exit_price,
  x.trigger_price,
  x.mfe_r,
  x.mae_r,
  x.current_r,
  x.max_tp_progress,
  x.max_sl_progress,
  x.reached_half_r,
  x.reached_one_r,
  x.near_tp_seen,
  x.direct_to_sl,
  x.sl_after_half_r,
  x.sl_after_one_r,
  x.sl_after_near_tp,
  x.break_even_activated,
  x.break_even_stop,
  x.break_even_sl
FROM trade_entries e
LEFT JOIN LATERAL (
  SELECT *
  FROM trade_exits tx
  WHERE tx.trade_id = e.trade_id
  ORDER BY tx.closed_at DESC
  LIMIT 1
) x ON TRUE;