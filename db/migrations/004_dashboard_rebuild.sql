-- Migration 004: Dashboard rebuild — org/sequence summaries + rewrite explanation/confidence

-- Create org_summaries table
CREATE TABLE org_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_text text,
  generated_at timestamptz DEFAULT now(),
  data_snapshot jsonb
);

-- Create sequence_summaries table
CREATE TABLE sequence_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id text,
  summary_text text,
  generated_at timestamptz DEFAULT now(),
  data_snapshot jsonb
);

-- Add explanation and confidence columns to rewrite_suggestions
ALTER TABLE rewrite_suggestions
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS confidence text;
