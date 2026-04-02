"""
pipeline/regenerate_rewrites.py

Backfills rewrite_suggestions by re-running the Claude rewrite prompt for every
existing row in the table.

Run after:
  - prompts/rewrite.py explanation prompt changes
  - persona_configs are updated
  - Any schema or metric change that affects the rewrite quality

Does NOT re-seed new rows — only updates rows that already exist.
Run pipeline/main.py first if you want new rows generated.

Usage (from repo root):
    python pipeline/regenerate_rewrites.py
"""

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# Allow importing from repo root (prompts/rewrite.py)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from prompts.rewrite import generate_rewrite  # noqa: E402

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(sb: Client) -> None:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY must be set in .env")

    # Fetch all existing rewrite rows
    resp = sb.table("rewrite_suggestions").select(
        "id, step_id, persona_config_id"
    ).execute()

    rows = resp.data or []
    if not rows:
        print("rewrite_suggestions is empty — nothing to regenerate.")
        return

    print(f"Found {len(rows)} rewrite_suggestions rows to regenerate.")

    updated = 0
    skipped = 0
    errors = 0

    for i, row in enumerate(rows, 1):
        step_id = row["step_id"]
        persona_config_id = row["persona_config_id"]
        rewrite_id = row["id"]

        print(f"[{i}/{len(rows)}] step_id={step_id}  persona_config_id={persona_config_id}")

        # Fetch step metrics from step_performance
        step_resp = (
            sb.table("step_performance")
            .select("*")
            .eq("step_id", step_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not step_resp.data:
            print(f"  SKIP: no step_performance row for step_id={step_id}")
            skipped += 1
            continue

        step = step_resp.data[0]

        # Fetch persona config
        persona_resp = (
            sb.table("persona_configs")
            .select("*")
            .eq("id", persona_config_id)
            .limit(1)
            .execute()
        )
        if not persona_resp.data:
            print(f"  SKIP: no persona_configs row for id={persona_config_id}")
            skipped += 1
            continue

        persona = persona_resp.data[0]

        # Call Claude
        try:
            result = generate_rewrite(step, persona, ANTHROPIC_API_KEY)
        except Exception as exc:
            print(f"  ERROR calling Claude: {exc}")
            errors += 1
            continue

        # Update the existing row
        update_resp = (
            sb.table("rewrite_suggestions")
            .update({
                "diagnosis": result["diagnosis"],
                "suggested_subject": result["suggested_subject"],
                "suggested_body": result["suggested_body"],
                "confidence": result["confidence"],
                "explanation": result["explanation"],
                "model_used": "claude-sonnet-4-6",
            })
            .eq("id", rewrite_id)
            .execute()
        )

        if not update_resp.data:
            print(f"  WARNING: update returned no data for id={rewrite_id}")
            errors += 1
        else:
            print(f"  OK: updated id={rewrite_id}")
            updated += 1

        # Brief pause to avoid hammering the API
        time.sleep(0.5)

    print(f"\nDone. Updated: {updated}  Skipped: {skipped}  Errors: {errors}")


if __name__ == "__main__":
    sb = get_supabase()
    run(sb)
