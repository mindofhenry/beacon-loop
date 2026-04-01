-- 005_bayesian_attribution.sql
-- Adds columns and tables for position-adjusted Bayesian flagging
-- with gated geometric mean health score (health_score_v2).
-- All new columns on step_performance are nullable so existing rows are unaffected.

-- ---------------------------------------------------------------------------
-- 1. New columns on step_performance
-- ---------------------------------------------------------------------------

ALTER TABLE step_performance
  ADD COLUMN IF NOT EXISTS position_expected_rate       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS step_intent                  TEXT,
  ADD COLUMN IF NOT EXISTS intent_threshold_multiplier  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bayesian_reply_rate          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bayesian_meeting_rate        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bayesian_opp_rate            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS health_score_v2              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS health_gate_override         BOOLEAN,
  ADD COLUMN IF NOT EXISTS send_volume_tier             TEXT,
  ADD COLUMN IF NOT EXISTS flag_type                    TEXT,
  ADD COLUMN IF NOT EXISTS flag_confidence              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS credible_interval_upper      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS credible_interval_lower      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS peer_modified_zscore         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ewma_signal                  DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- 2. step_attribution_credit — per-step, per-opportunity credit allocation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS step_attribution_credit (
  id               BIGSERIAL PRIMARY KEY,
  step_id          UUID REFERENCES step_performance(id),
  opportunity_id   TEXT,
  model_type       TEXT,
  credit_fraction  DOUBLE PRECISION,
  calculated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. intent_thresholds — reference/seed data for step intent multipliers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS intent_thresholds (
  intent_type          TEXT PRIMARY KEY,
  threshold_multiplier DOUBLE PRECISION,
  description          TEXT
);

-- Seed intent_thresholds
INSERT INTO intent_thresholds (intent_type, threshold_multiplier, description)
VALUES
  ('cold_opener',    1.0,  'First touch, baseline expectation'),
  ('follow_up',     0.75, 'Bump/nudge, lower expected engagement'),
  ('value_add',     1.0,  'New insight or resource, baseline expectation'),
  ('social_proof',  0.8,  'Testimonials/logos, slightly lower expectation'),
  ('breakup',       2.0,  'Loss-aversion trigger, 2-3x normal reply rates'),
  ('multi_channel', NULL,  'LinkedIn/call — scored separately')
ON CONFLICT (intent_type) DO NOTHING;
