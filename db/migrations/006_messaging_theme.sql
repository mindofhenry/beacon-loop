-- 006_messaging_theme.sql
-- Adds messaging_theme classification columns to sequence_steps and step_performance.
-- Used by pipeline/classify_messaging_theme.py (Claude-based theme classifier)
-- and carried through to step_performance for dashboard attribution charts.

-- ---------------------------------------------------------------------------
-- 1. sequence_steps — theme tag + classification timestamp
-- ---------------------------------------------------------------------------

ALTER TABLE sequence_steps
  ADD COLUMN IF NOT EXISTS messaging_theme              TEXT,
  ADD COLUMN IF NOT EXISTS messaging_theme_classified_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. step_performance — theme tag (passthrough from sequence_steps)
-- ---------------------------------------------------------------------------

ALTER TABLE step_performance
  ADD COLUMN IF NOT EXISTS messaging_theme TEXT;
