-- 009_opp_amount_on_attribution.sql
-- Adds opportunity_amount to step_attribution_credit so the dashboard can
-- compute deduplicated pipeline totals without double-counting across steps.

ALTER TABLE step_attribution_credit
  ADD COLUMN IF NOT EXISTS opportunity_amount DOUBLE PRECISION;
