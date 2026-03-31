-- 002_attribution_model.sql
-- Attribution model tables for Beacon Loop step-level attribution pipeline.

-- Raw event table: one row per email sent to one person from one sequence step.
CREATE TABLE IF NOT EXISTS step_touchpoints (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source              TEXT NOT NULL,
  sequence_id         TEXT NOT NULL,
  sequence_name       TEXT,
  step_id             TEXT NOT NULL,
  step_number         INTEGER NOT NULL,
  step_type           TEXT,
  contact_email       TEXT NOT NULL,
  contact_id          TEXT,
  opportunity_id      TEXT,
  sent_at             TIMESTAMPTZ,
  opened              BOOLEAN DEFAULT FALSE,
  clicked             BOOLEAN DEFAULT FALSE,
  replied             BOOLEAN DEFAULT FALSE,
  meeting_booked      BOOLEAN DEFAULT FALSE,
  attribution_type    TEXT DEFAULT 'last_touch',
  pipeline_run_id     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Per-step performance snapshot, written once per pipeline run.
CREATE TABLE IF NOT EXISTS step_performance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id       TEXT NOT NULL,
  snapshot_date         DATE NOT NULL,
  source                TEXT NOT NULL,
  sequence_id           TEXT NOT NULL,
  sequence_name         TEXT,
  step_id               TEXT NOT NULL,
  step_number           INTEGER NOT NULL,
  step_type             TEXT,
  send_volume           INTEGER DEFAULT 0,
  open_count            INTEGER DEFAULT 0,
  click_count           INTEGER DEFAULT 0,
  reply_count           INTEGER DEFAULT 0,
  meeting_count         INTEGER DEFAULT 0,
  opp_created_count     INTEGER DEFAULT 0,
  open_rate             NUMERIC(5,4),
  click_rate            NUMERIC(5,4),
  reply_rate            NUMERIC(5,4),
  meeting_rate          NUMERIC(5,4),
  opp_created_rate      NUMERIC(5,4),
  pipeline_value        NUMERIC(12,2),
  closed_won_count      INTEGER DEFAULT 0,
  closed_won_rate       NUMERIC(5,4),
  health_score          NUMERIC(5,4),
  flagged               BOOLEAN DEFAULT FALSE,
  flag_reasons          JSONB,
  weight_config_snapshot JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Single-row config table for weights and thresholds.
CREATE TABLE IF NOT EXISTS attribution_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name           TEXT NOT NULL DEFAULT 'default',
  weight_reply_rate     NUMERIC(4,3) DEFAULT 0.500,
  weight_meeting_rate   NUMERIC(4,3) DEFAULT 0.300,
  weight_opp_rate       NUMERIC(4,3) DEFAULT 0.200,
  threshold_reply_rate  NUMERIC(5,4) DEFAULT 0.0300,
  threshold_meeting_rate NUMERIC(5,4) DEFAULT 0.0100,
  threshold_health_score NUMERIC(5,4) DEFAULT 0.4000,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config row (only if table is empty).
INSERT INTO attribution_config (config_name)
SELECT 'default'
WHERE NOT EXISTS (SELECT 1 FROM attribution_config);

-- Audit log of every pipeline execution.
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                TEXT PRIMARY KEY,
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  status            TEXT DEFAULT 'running',
  demo_mode         BOOLEAN DEFAULT TRUE,
  source_files      JSONB,
  touchpoints_written INTEGER DEFAULT 0,
  snapshots_written   INTEGER DEFAULT 0,
  error_message     TEXT
);
