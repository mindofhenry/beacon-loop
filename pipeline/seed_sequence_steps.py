"""
pipeline/seed_sequence_steps.py
Seeds the sequence_steps table from synthetic JSON files.

Reads data/synthetic/sequence_steps.json (Outreach) and
data/synthetic/sl_steps.json (Salesloft), normalises both into
the sequence_steps schema, and inserts all records via the
Supabase Python client.
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic"

BATCH = 100


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _outreach_records(path: Path) -> list[dict]:
    with open(path) as f:
        steps = json.load(f)
    records = []
    for s in steps:
        attrs = s.get("attributes", {})
        seq_id = str(
            s.get("relationships", {})
            .get("sequence", {})
            .get("data", {})
            .get("id", "")
        )
        email_template = attrs.get("type_settings", {}) or {}
        records.append({
            "step_id":      str(s["id"]),
            "sequence_id":  seq_id,
            "step_number":  attrs.get("order"),
            "display_name": attrs.get("displayName"),
            "step_type":    attrs.get("stepType"),
            "subject":      attrs.get("subject"),
            "body_text":    attrs.get("bodyText"),
            "body_html":    attrs.get("bodyHtml"),
            "created_at":   attrs.get("createdAt"),
            "updated_at":   attrs.get("updatedAt"),
            "source":       "outreach",
        })
    return records


def _salesloft_records(path: Path) -> list[dict]:
    with open(path) as f:
        steps = json.load(f)
    records = []
    for s in steps:
        ts = s.get("type_settings") or {}
        email_tpl = ts.get("email_template") or {}
        records.append({
            "step_id":      str(s["id"]),
            "sequence_id":  str(s["cadence_id"]),
            "step_number":  s.get("step_number"),
            "display_name": s.get("name"),
            "step_type":    s.get("type"),
            "subject":      email_tpl.get("subject"),
            "body_text":    email_tpl.get("body"),
            "body_html":    None,
            "created_at":   s.get("created_at"),
            "updated_at":   s.get("updated_at"),
            "source":       "salesloft",
        })
    return records


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def seed(sb: Client) -> None:
    or_path = DATA_DIR / "sequence_steps.json"
    sl_path = DATA_DIR / "sl_steps.json"

    outreach = _outreach_records(or_path)
    salesloft = _salesloft_records(sl_path)
    records = outreach + salesloft
    expected = len(records)
    print(f"Expected inserts: {expected} ({len(outreach)} outreach + {len(salesloft)} salesloft)")

    written = 0
    for i in range(0, len(records), BATCH):
        chunk = records[i : i + BATCH]
        sb.table("sequence_steps").insert(chunk).execute()
        written += len(chunk)

    resp = sb.table("sequence_steps").select("id", count="exact").execute()
    actual = resp.count
    print(f"Actual rows in table: {actual}")

    if actual == expected:
        print("OK — row count matches expected")
    else:
        print(f"WARNING — mismatch: expected {expected}, got {actual}")
        sys.exit(1)


if __name__ == "__main__":
    sb = get_supabase()
    seed(sb)
