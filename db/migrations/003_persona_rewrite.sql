-- 003_persona_rewrite.sql
-- Persona configs and Claude-generated rewrite suggestions for Beacon Loop.

-- Persona definitions used when generating step rewrites via Claude.
CREATE TABLE IF NOT EXISTS persona_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  title           TEXT,
  industry        TEXT,
  company_size    TEXT,
  pain_points     TEXT[],
  tone            TEXT DEFAULT 'professional',
  extra_context   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed one default persona so get_rewrite_suggestion works immediately.
INSERT INTO persona_configs (name, title, industry, company_size, pain_points, tone)
SELECT 'Default VP Sales', 'VP of Sales', 'B2B SaaS', '50-500 employees',
       ARRAY['low reply rates', 'unqualified pipeline', 'long sales cycles'],
       'direct'
WHERE NOT EXISTS (SELECT 1 FROM persona_configs);

-- Claude-generated diagnosis and rewrite for a specific step + persona pair.
CREATE TABLE IF NOT EXISTS rewrite_suggestions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id             TEXT NOT NULL,
  sequence_id         TEXT,
  sequence_name       TEXT,
  step_number         INTEGER,
  persona_config_id   UUID REFERENCES persona_configs(id),
  diagnosis           TEXT NOT NULL,
  suggested_subject   TEXT NOT NULL,
  suggested_body      TEXT NOT NULL,
  model_used          TEXT DEFAULT 'claude-sonnet-4-6',
  pipeline_run_id     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
