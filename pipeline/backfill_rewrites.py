"""
pipeline/backfill_rewrites.py

Seeds rewrite_suggestions for every flagged step in step_performance by
running the full RewriteEngine pipeline (classify → route → rewrite → INSERT).

Usage (from repo root):
    python pipeline/backfill_rewrites.py

Skips steps that already have a row in rewrite_suggestions.
"""

import json
import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from supabase import create_client, Client

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set in .env")

from engine.rewrite_engine import RewriteEngine, AnthropicLLMClient, REWRITE_MODEL  # noqa: E402


def _db():
    return psycopg2.connect(
        DATABASE_URL,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_flagged_step_ids(sb: Client) -> list[str]:
    """Return step_ids for all flagged steps in step_performance."""
    resp = (
        sb.table("step_performance")
        .select("step_id")
        .neq("flag_type", "none")
        .execute()
    )
    return [row["step_id"] for row in resp.data]


def fetch_existing_rewrite_step_ids(sb: Client) -> set[str]:
    """Return step_ids that already have a rewrite_suggestions row."""
    resp = sb.table("rewrite_suggestions").select("step_id").execute()
    return {row["step_id"] for row in resp.data}


def _store_fallback(engine: RewriteEngine, step_id: str) -> str | None:
    """Fallback path: classify_only() → INSERT with classifier-derived content.

    Used when the full rewrite() call fails due to LLM JSON parse error.
    Inserts a row with the classifier diagnosis so the step is covered, and
    marks methodology_used as 'classifier_fallback' for easy identification.
    """
    diagnosis_data = engine.classify_only(step_id)
    if "error" in diagnosis_data:
        return None

    signal  = diagnosis_data["signal_class"]
    fms     = diagnosis_data["failure_modes"]
    step    = diagnosis_data["step_data"]
    context = diagnosis_data["context"]

    fm_summary = "; ".join(
        f"{fm['code']}: {fm['name']}" for fm in fms
    ) if fms else "No specific failure modes detected"

    diagnosis = (
        f"Signal: {signal}. Failure modes: {fm_summary}. "
        f"Step {step['step_number']}/{step['max_step_number']} flagged for underperformance."
    )

    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO rewrite_suggestions
                (step_id, sequence_id, sequence_name, step_number,
                 persona_config_id, diagnosis, suggested_subject, suggested_body,
                 confidence, explanation, model_used, pipeline_run_id,
                 failure_modes_detected, methodology_used, rewrite_directions,
                 signal_class, step_copy_snapshot)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                step_id,
                step.get("sequence_id", ""),
                step.get("sequence_name", ""),
                step["step_number"],
                context.get("persona_config_id"),
                diagnosis,
                step.get("subject") or "— subject rewrite pending —",
                step.get("body_text") or "— body rewrite pending —",
                "LOW",
                "Fallback row — LLM JSON parse failed on primary attempt.",
                REWRITE_MODEL,
                None,
                json.dumps(fms),
                "classifier_fallback",
                json.dumps([]),
                signal,
                json.dumps({"subject": step.get("subject"), "body": step.get("body_text")}),
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return str(row["id"]) if row else None
    finally:
        conn.close()


def main() -> None:
    sb = get_supabase()
    engine = RewriteEngine(db_factory=_db, llm_client=AnthropicLLMClient())

    flagged = fetch_flagged_step_ids(sb)
    existing = fetch_existing_rewrite_step_ids(sb)

    to_generate = [sid for sid in flagged if sid not in existing]

    print(f"Flagged steps: {len(flagged)}")
    print(f"Already have rewrites: {len(existing)}")
    print(f"To generate: {len(to_generate)}")

    if not to_generate:
        print("Nothing to generate — all flagged steps have rewrites.")
        return

    generated = 0
    fallback = 0
    errors = 0

    for i, step_id in enumerate(to_generate, 1):
        print(f"[{i}/{len(to_generate)}] step_id={step_id}")
        try:
            result = engine.rewrite(step_id, store=True)
            if result.error:
                print(f"  ERROR: {result.error}")
                errors += 1
            else:
                print(f"  OK: suggestion_id={result.suggestion_id}  "
                      f"signal={result.signal_class}  confidence={result.confidence}  "
                      f"persona={result.persona}")
                generated += 1
        except Exception as exc:
            # LLM JSON parse failure → fallback to classifier-derived row
            print(f"  PARSE FAIL ({type(exc).__name__}) — using classifier fallback")
            try:
                fid = _store_fallback(engine, step_id)
                if fid:
                    print(f"  FALLBACK OK: id={fid}")
                    fallback += 1
                else:
                    print(f"  FALLBACK FAILED: classify_only returned error")
                    errors += 1
            except Exception as exc2:
                print(f"  FALLBACK EXCEPTION: {exc2}")
                errors += 1

        # Brief pause between Claude calls
        if i < len(to_generate):
            time.sleep(0.5)

    print(f"\nDone. Generated: {generated}  Fallback: {fallback}  Errors: {errors}")

    # Verify populated fields
    resp = sb.table("rewrite_suggestions").select(
        "step_id, failure_modes_detected, methodology_used, step_copy_snapshot"
    ).execute()
    rows = resp.data
    missing_fmd = sum(1 for r in rows if not r.get("failure_modes_detected"))
    missing_mu  = sum(1 for r in rows if not r.get("methodology_used"))
    missing_scs = sum(1 for r in rows if not r.get("step_copy_snapshot"))
    print(f"\nRewrite rows total: {len(rows)}")
    print(f"  failure_modes_detected populated: {len(rows) - missing_fmd}/{len(rows)}")
    print(f"  methodology_used populated:       {len(rows) - missing_mu}/{len(rows)}")
    print(f"  step_copy_snapshot populated:     {len(rows) - missing_scs}/{len(rows)}")


if __name__ == "__main__":
    main()
