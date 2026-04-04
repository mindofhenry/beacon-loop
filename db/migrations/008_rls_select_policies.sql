-- 008_rls_select_policies.sql
-- Adds open SELECT policies to all public tables.
-- Beacon Loop has no per-user RLS — all reads are open (service role + anon).
-- Without these, the dashboard anon key gets zero rows from any table
-- that has RLS enabled but no policy (Supabase enables RLS by default).

CREATE POLICY "Enable read access for all users" ON reps
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON step_attribution_credit
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON sequence_steps
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON sequence_summaries
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON attribution_config
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON intent_thresholds
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON org_summaries
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON persona_configs
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON pipeline_runs
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON sequence_persona_map
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON step_touchpoints
  FOR SELECT USING (true);
