# Beacon Loop — Claude Code Instructions

## What This Is

Beacon Loop is a step-level sequence attribution engine. It closes the gap
Outreach explicitly admits exists: no step-level meeting attribution, no mapping
from sequence performance to pipeline outcomes, no automated path from "this
step is broken" to "here's what to write instead."

**One-line problem statement:** Outreach admits it doesn't do step-level
attribution. Beacon Loop does.

This is a portfolio project built by Henry Marble as part of a career pivot
from SDR to GTM Engineer. Do not reference Pave as a current employer or
accessible resource.

## Tech Stack

- **Data pipeline:** Python, Pandas (Railway)
- **Database:** Supabase (PostgreSQL) — no per-user RLS; service role only
- **LLM layer:** Claude API (`claude-sonnet-4-6`), persona-aware prompts
- **MCP server:** FastMCP, SSE transport (required for Railway)
- **Dashboard:** Next.js, TypeScript (Vercel)
- **CRM:** Salesforce REST API, DOOM Inc Developer Edition org
- **Sequencer data:** Outreach and Salesloft API schemas (synthetic data only)
- **Call activity:** Nooks (synthetic, CSV format for v1)

## Repo Structure

```
data/
  shared/          # contact_pool.py — shared email pool across generators
  synthetic/       # Generated output files (.json, .csv) — gitignored
db/
  migrations/      # SQL migration files — numbered 001, 002, etc.
mcp_server/
  server.py        # FastMCP server — all five MCP tools live here
  tools/           # Tool modules (if split out later)
pipeline/
  generators/      # Synthetic data generators (outreach, salesloft, salesforce)
  transforms/      # Attribution model transforms
  loaders/         # Supabase loaders
  attribution_model.py
  main.py
dashboard/         # Next.js frontend (not yet scaffolded)
.claude/skills/    # Read the relevant skill before touching that domain
```

## Before You Write Any Code

1. **Read the relevant skill file(s)** from `.claude/skills/`
2. **Read the files you are about to edit** — do not assume you know what is there
3. **Check the migration files** in `db/migrations/` before writing any SQL
4. **Never write code directly in the planning interface** — all implementation
   happens here in Claude Code

## Skills Reference — When to Read Each

| Skill | Read when... |
|---|---|
| `planning-with-files` | Any task requiring 5+ tool calls — invoke at session start |
| `improve-codebase-architecture` | Exploring refactors — run post-feature, not mid-build |
| `triage-issue` | Investigating a bug — run before attempting a fix |
| `write-a-skill` | Creating a new `.claude/skills/` file |
| `supabase-query-safety` | Writing any database query or migration |

## Branch Strategy

- `skeleton` — architecture and logic, no data loaded
- `demo` — fully seeded with synthetic data, all tools wired, dashboard live

All active development happens on `skeleton` until the data layer is complete,
then merges to `demo` when fully seeded.

## Hard Rules — Things CC Gets Wrong

### Data

- **All data is synthetic.** No real company data is used anywhere. Do not
  attempt to connect to real Outreach, Salesloft, or Salesforce orgs.
- **Synthetic data lives in `data/synthetic/`** — gitignored. Never commit it.
- **Email address is the join key** between sequencer activity and Salesforce
  contacts. It must be consistent across all synthetic datasets.
- **Outreach uses `or_` prefixes; Salesloft uses `sl_` prefixes** on all IDs
  and output files. Never mix conventions.

### Database

- **No per-user RLS.** Beacon Loop is a pipeline tool, not a multi-user SaaS.
  All queries use the service role key. Do not add RLS policies.
- **Always use the `DATABASE_URL` env var** for direct psycopg2 connections
  (pipeline, MCP server). Use `SUPABASE_URL` + `SUPABASE_KEY` only for the
  Supabase Python client where needed.
- **Schema is flat (no `loop.` prefix).** Tables live in the public schema.
  Do not add schema prefixes to queries.
- **Always destructure and check errors** on every Supabase or psycopg2 call.
  Never assume success.

### MCP Server

- **Transport is SSE, not stdio.** FastMCP is configured with
  `transport="sse", host="0.0.0.0", port=8000`. Do not change this — it is
  required for Railway deployment.
- **All five tools must remain callable** at all times:
  `get_sequence_health`, `get_step_breakdown`, `get_underperforming_steps`,
  `get_rewrite_suggestion`, `compare_sequences`.
- **LLM model is `claude-sonnet-4-6`.** Do not substitute another model.

### Pipeline

- **`DEMO_MODE=true`** in `.env` means the pipeline reads from
  `data/synthetic/` instead of live APIs. Do not remove this flag.
- **Deterministic seeding:** Use a seeded `random` instance for IDs,
  attrition, and timestamps. Use an unseeded instance for engagement rates.
  Never mix them — seed lock-in suppresses behavioral flags.

### Secrets

- `SUPABASE_KEY` is the service role key — server/pipeline context only.
  Never expose it in dashboard client-side code.
- `ANTHROPIC_API_KEY` is server-side only.
- `DATABASE_URL` contains credentials — never log it.

## Database — Key Tables

| Table | Purpose |
|---|---|
| `step_touchpoints` | Raw event log — one row per email sent per step per contact |
| `step_performance` | Per-step snapshot per pipeline run — primary query target |
| `attribution_config` | Single-row config for weights and thresholds |
| `pipeline_runs` | Audit log of every pipeline execution |
| `persona_configs` | Persona definitions used for LLM rewrite prompts |
| `rewrite_suggestions` | Claude-generated diagnosis + rewrite per step + persona pair |

**Key join:** `step_touchpoints.contact_email` → Salesforce contact email →
`opportunity_id` via OpportunityContactRole.

## Environment Variables

Required in `.env` (never read or output this file):

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_KEY` — Service role key (not anon key)
- `DATABASE_URL` — Direct PostgreSQL connection string (used by psycopg2)
- `ANTHROPIC_API_KEY` — Claude API key
- `DEMO_MODE` — Set to `true` for synthetic data mode
- `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_USERNAME`, `SF_PASSWORD`,
  `SF_SECURITY_TOKEN`, `SF_INSTANCE_URL` — Salesforce OAuth credentials

## Common Commands

```bash
# Run the pipeline (from project root)
python pipeline/attribution_model.py

# Run a specific generator
python pipeline/generators/outreach_generator.py
python pipeline/generators/salesloft_generator.py
python pipeline/generators/generate_salesforce.py

# Start the MCP server locally
python mcp_server/server.py

# Install pipeline dependencies
pip install -r pipeline/requirements.txt

# Install MCP server dependencies
pip install -r mcp_server/requirements.txt
```

## Keeping Skills Up to Date

After completing any task, check whether new patterns were introduced that
the relevant skill doesn't cover. If so, update the skill before ending the
session.

**Update `supabase-query-safety` when:**
- A new table is added — add it to the Table Reference section
- A new column changes safe query patterns
- A new connection pattern is introduced (e.g. async driver, new client)

**Update `triage-issue` when:**
- A new investigation pattern proves useful and should be standardized
- The GitHub issue template changes

**Update `improve-codebase-architecture` when:**
- A new dependency category is identified that doesn't fit the four existing ones
- The GitHub issue RFC template changes

**Update `write-a-skill` when:**
- A new skill structure pattern is established that should be the default
- The description format or trigger conventions change

**Update `planning-with-files` when:**
- A new planning file pattern proves useful across sessions
- The session-catchup script needs changes for Beacon Loop's project path format

**Update `CLAUDE.md` (this file) when:**
- The tech stack changes (new dependency, removed library)
- A new hard rule is identified — something CC got wrong that wasn't covered
- The database tables section changes (new table added, column affects queries)
- The MCP tools change (tool added, renamed, or removed)
- Common commands change
- The branch strategy changes

The rule: **if a future CC session would get it wrong without knowing what you just built, update the relevant skill now.**


## Response Format

- Show only the file(s) being changed and the specific diff or replacement
- One concept at a time — do not bundle unrelated changes
- If a change touches more than 3 files, flag it and confirm before proceeding
