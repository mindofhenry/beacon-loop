"""
pipeline/classify_messaging_theme.py

Classifies every step in sequence_steps into exactly one messaging theme
using Claude. Results are written back to sequence_steps.messaging_theme
and used downstream in step_performance for dashboard attribution charts.

Taxonomy (5 categories, mutually exclusive):
  pain_point    — Leads with a problem the prospect is experiencing
  social_proof  — References customer stories, case studies, peer results
  value_add     — Offers a resource (report, benchmark, framework) as hook
  trigger_event — Anchors on something the prospect's company did
  breakup       — Closing/file-closing language, last touch

Usage:
  python pipeline/classify_messaging_theme.py
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

MODEL = "claude-sonnet-4-20250514"
BATCH_SIZE = 15
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds, doubled each retry

VALID_THEMES = {"pain_point", "social_proof", "value_add", "trigger_event", "breakup"}

SYSTEM_PROMPT = """You are a messaging theme classifier for B2B outbound sales sequences.

Classify each email step into exactly ONE of these 5 categories:

1. **pain_point** — Leads with a problem the prospect is experiencing. The hook is "you have this problem."
   Examples: "Are you still struggling with pipeline visibility?", "Most RevOps teams can't attribute meetings to specific steps"

2. **social_proof** — References a customer story, case study, peer results, or named company outcome. The hook is "someone like you solved this."
   Examples: "How Acme Corp lifted reply rates by 3x", "A team like yours cut their ramp time in half"

3. **value_add** — Offers a resource (report, benchmark, framework, data) as the primary hook. The hook is "here's something useful."
   Examples: "Quick benchmark data for your team", "I put together a breakdown of step-level failure patterns"

4. **trigger_event** — Anchors on something the prospect's company did (funding round, hiring, product launch, expansion). The hook is "I noticed you just did X."
   Examples: "Congrats on the Series B", "Saw you're hiring 10 SDRs — thought this was relevant"

5. **breakup** — Closing/file-closing language, last touch, "should I stop reaching out." The hook is "this is my last note."
   Examples: "Closing the loop", "Last note from me", "Should I close your file?"

Rules:
- Return ONLY a JSON array. No markdown fences, no explanation.
- Each element: {"step_id": "...", "messaging_theme": "..."}
- Every step in the input MUST appear in the output.
- If a step could fit multiple categories, choose the DOMINANT hook — the one the reader encounters first.
- Call steps with only a call script: classify as pain_point if the script mentions a problem, otherwise classify based on the dominant hook."""

USER_PROMPT_TEMPLATE = """Classify each step below into exactly one messaging theme.

Steps:
{steps_json}

Return a JSON array: [{{"step_id": "...", "messaging_theme": "..."}}]"""


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_anthropic() -> anthropic.Anthropic:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY must be set in .env")
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# Fetch unclassified steps
# ---------------------------------------------------------------------------

def fetch_unclassified(sb: Client) -> list[dict]:
    """Fetch sequence_steps rows where messaging_theme IS NULL and copy exists."""
    resp = (
        sb.table("sequence_steps")
        .select("step_id, subject, body_text, step_type")
        .is_("messaging_theme", "null")
        .execute()
    )

    rows = resp.data
    # Filter to rows that have at least subject or body_text
    return [r for r in rows if r.get("subject") or r.get("body_text")]


# ---------------------------------------------------------------------------
# Claude classification
# ---------------------------------------------------------------------------

def build_batch_payload(rows: list[dict]) -> str:
    """Build the JSON array for the user prompt."""
    items = []
    for r in rows:
        body_preview = (r.get("body_text") or "")[:200]
        items.append({
            "step_id": r["step_id"],
            "subject": r.get("subject") or "(no subject — call step)",
            "body_preview": body_preview,
        })
    return json.dumps(items, indent=2)


def classify_batch(
    client: anthropic.Anthropic,
    rows: list[dict],
) -> tuple[list[dict], int, int]:
    """Send a batch of steps to Claude for classification.

    Returns:
        (results, input_tokens, output_tokens)
        results is a list of {"step_id": ..., "messaging_theme": ...}
    """
    steps_json = build_batch_payload(rows)
    user_prompt = USER_PROMPT_TEMPLATE.format(steps_json=steps_json)

    for attempt in range(MAX_RETRIES):
        try:
            message = client.messages.create(
                model=MODEL,
                max_tokens=1024,
                temperature=0,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )

            raw_text = message.content[0].text.strip()
            input_tokens = message.usage.input_tokens
            output_tokens = message.usage.output_tokens

            # Parse — strip markdown fences if present
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[1]
                if raw_text.endswith("```"):
                    raw_text = raw_text[: raw_text.rfind("```")]

            results = json.loads(raw_text)

            # Validate
            valid = []
            for item in results:
                sid = item.get("step_id")
                theme = item.get("messaging_theme")
                if sid and theme in VALID_THEMES:
                    valid.append({"step_id": str(sid), "messaging_theme": theme})
                else:
                    print(f"  WARNING: invalid classification for step_id={sid}: theme={theme}")

            return valid, input_tokens, output_tokens

        except anthropic.RateLimitError:
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"  Rate limited, retrying in {wait}s...")
            time.sleep(wait)
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"  Parse error on attempt {attempt + 1}: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF)

    print("  ERROR: batch failed after all retries")
    return [], 0, 0


# ---------------------------------------------------------------------------
# Write results back
# ---------------------------------------------------------------------------

def write_classifications(sb: Client, results: list[dict]) -> int:
    """Update sequence_steps with messaging_theme and classified_at timestamp."""
    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for item in results:
        resp = (
            sb.table("sequence_steps")
            .update({
                "messaging_theme": item["messaging_theme"],
                "messaging_theme_classified_at": now,
            })
            .eq("step_id", item["step_id"])
            .execute()
        )
        if resp.data:
            updated += 1
        else:
            print(f"  WARNING: update returned no data for step_id={item['step_id']}")
    return updated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("[classify_messaging_theme] Starting messaging theme classification")

    sb = get_supabase()
    client = get_anthropic()

    # Fetch unclassified steps
    rows = fetch_unclassified(sb)
    print(f"[classify_messaging_theme] Found {len(rows)} unclassified steps with copy")

    if not rows:
        print("[classify_messaging_theme] Nothing to classify — done.")
        return

    # Process in batches
    total_classified = 0
    total_api_calls = 0
    total_input_tokens = 0
    total_output_tokens = 0
    all_results: list[dict] = []

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"[classify_messaging_theme] Batch {batch_num}/{total_batches} ({len(batch)} steps)")

        results, inp_tok, out_tok = classify_batch(client, batch)
        total_api_calls += 1
        total_input_tokens += inp_tok
        total_output_tokens += out_tok

        if results:
            written = write_classifications(sb, results)
            total_classified += written
            all_results.extend(results)
            print(f"  Classified: {written}/{len(batch)}")

    # Report distribution
    print(f"\n[classify_messaging_theme] === RESULTS ===")
    print(f"  Total steps classified: {total_classified}")
    print(f"  Total API calls: {total_api_calls}")
    print(f"  Total input tokens: {total_input_tokens}")
    print(f"  Total output tokens: {total_output_tokens}")

    # Theme distribution
    theme_counts: dict[str, int] = {}
    for r in all_results:
        theme = r["messaging_theme"]
        theme_counts[theme] = theme_counts.get(theme, 0) + 1

    print(f"\n  Theme distribution:")
    for theme in sorted(theme_counts.keys()):
        count = theme_counts[theme]
        pct = (count / total_classified * 100) if total_classified > 0 else 0
        print(f"    {theme}: {count} ({pct:.1f}%)")

    # Check for steps that couldn't be classified
    unclassified_after = fetch_unclassified(sb)
    if unclassified_after:
        print(f"\n  WARNING: {len(unclassified_after)} steps still unclassified after run")
    else:
        print(f"\n  All classifiable steps have a messaging_theme.")


if __name__ == "__main__":
    main()
