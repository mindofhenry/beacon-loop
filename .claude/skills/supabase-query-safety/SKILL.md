---
name: supabase-query-safety
description: Enforce safe Supabase and psycopg2 query patterns for Beacon Loop. Use when writing any database query, migration, or pipeline script that touches Supabase or the PostgreSQL connection.
---

# Supabase Query Safety Skill

You are writing Supabase queries for **Beacon Loop**. Read this document before writing any database interaction. Beacon Loop is a pipeline tool — there is no end-user auth and no per-user RLS. All queries use the service role key.

---

## Golden Rule

**Never use the anon key for pipeline or MCP server queries. Always use the service role key via `SUPABASE_KEY` or connect directly via `DATABASE_URL`.**

```python
# ❌ WRONG — anon key has restricted permissions
client = create_client(url, os.getenv("SUPABASE_ANON_KEY"))

# ✅ CORRECT — service role key for pipeline/MCP server
client = create_client(url, os.getenv("SUPABASE_KEY"))

# ✅ ALSO CORRECT — direct psycopg2 connection for pipeline
conn = psycopg2.connect(os.getenv("DATABASE_URL"), sslmode="require")
```

---

## Client vs Connection

| Context | Method | When to use |
|---|---|---|
| Pipeline scripts | `psycopg2` via `DATABASE_URL` | Bulk writes, attribution runs |
| MCP server tools | `psycopg2` via `DATABASE_URL` | All five MCP tools |
| Admin/utility scripts | Supabase Python client via `SUPABASE_KEY` | One-off queries, migrations |

When in doubt, use `DATABASE_URL` + psycopg2. It's faster, more explicit, and already the established pattern in the codebase.

---

## Safe Query Patterns

### SELECT
```python
cur.execute(
    "SELECT * FROM step_performance WHERE snapshot_date = %s AND flagged = TRUE",
    (latest_date,)
)
rows = [dict(r) for r in cur.fetchall()]
```

### INSERT with RETURNING
```python
cur.execute(
    """
    INSERT INTO rewrite_suggestions
        (step_id, sequence_id, diagnosis, suggested_subject, suggested_body, model_used)
    VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id
    """,
    (step_id, sequence_id, diagnosis, subject, body, model)
)
conn.commit()
suggestion_id = cur.fetchone()["id"]
```

### UPDATE — always scope to a specific ID
```python
cur.execute(
    "UPDATE pipeline_runs SET status = %s, completed_at = NOW() WHERE id = %s",
    (status, run_id)
)
conn.commit()
```

---

## Error Handling

Always check errors on every query. Never assume success.

```python
# psycopg2
try:
    cur.execute("SELECT * FROM step_performance WHERE snapshot_date = %s", (date,))
    rows = cur.fetchall()
except psycopg2.Error as e:
    print(f"[query] DB error: {e}", file=sys.stderr)
    raise
finally:
    conn.close()
```

Never log the full `DATABASE_URL` — it contains credentials.

---

## Dangerous Patterns — Never Use

```python
# ❌ Unscoped UPDATE — will touch every row in the table
cur.execute("UPDATE pipeline_runs SET status = 'complete'")

# ❌ No error handling — silent failures corrupt pipeline state
cur.execute("INSERT INTO step_touchpoints ...")
conn.commit()  # no try/except

# ❌ SUPABASE_KEY used in dashboard client-side code
# Service role key bypasses everything — never expose it to the browser

# ❌ DATABASE_URL logged anywhere
print(f"Connecting to {os.getenv('DATABASE_URL')}")  # credentials in logs
```

---

## Table Reference

All tables live in the **public schema** (no prefix needed). No per-user RLS — service role only.

| Table | Purpose | Key columns |
|---|---|---|
| `step_touchpoints` | Raw event log — one row per email sent per step per contact | `sequence_id`, `step_id`, `contact_email`, `opportunity_id`, `pipeline_run_id` |
| `step_performance` | Per-step snapshot per pipeline run — primary query target for MCP tools | `snapshot_date`, `sequence_id`, `step_id`, `health_score`, `flagged`, `flag_reasons` |
| `attribution_config` | Single-row config for weights and thresholds | `weight_reply_rate`, `threshold_reply_rate`, `threshold_health_score` |
| `pipeline_runs` | Audit log of every pipeline execution | `id`, `status`, `demo_mode`, `started_at`, `completed_at`, `error_message` |
| `persona_configs` | Persona definitions used for LLM rewrite prompts | `name`, `title`, `industry`, `pain_points`, `tone` |
| `rewrite_suggestions` | Claude-generated diagnosis + rewrite per step + persona | `step_id`, `persona_config_id`, `diagnosis`, `suggested_subject`, `suggested_body` |

**Key join path:** `step_touchpoints.contact_email` → Salesforce contact → `opportunity_id` via OpportunityContactRole.

---

## Pre-Submit Checklist

- [ ] Using `SUPABASE_KEY` (service role) — not anon key
- [ ] Pipeline and MCP server queries use `DATABASE_URL` + psycopg2
- [ ] `DATABASE_URL` is never logged or exposed
- [ ] `SUPABASE_KEY` is never used in dashboard client-side code
- [ ] Every query has a try/except and checks for errors
- [ ] Every UPDATE and DELETE is scoped to a specific ID — no unscoped mutations
- [ ] `conn.commit()` called after every write, inside the try block
- [ ] `conn.close()` called in a finally block
