"""
pipeline/backfill_step_copy.py

Backfills subject and body_text on all rows in sequence_steps.
Uses a hardcoded lookup table keyed to (step_type_category, step_bucket).
Does NOT call the Claude API.

Step type categories:
  email → auto_email, Email, manual_email
  call  → call, Phone

Step buckets:
  1 → cold intro
  2 → follow-up referencing step 1
  3 → value-add
  4 → breakup / closing
  5 → final / leave door open (clamped ceiling)
"""

import os
import random
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Copy lookup table
# Each entry: (subject | None, body_text)
# subject is None for call/phone steps (no email subject).
# 3–4 variants per (category, bucket) — chosen deterministically per step_id.
# ---------------------------------------------------------------------------

EMAIL_TYPES = {"auto_email", "email", "manual_email"}

COPY: dict[tuple[str, int], list[tuple[str | None, str]]] = {

    # ── Email, Step 1: cold intro ──────────────────────────────────────────
    ("email", 1): [
        (
            "quick question, {{first_name}}",
            "Hi {{first_name}},\n\nMost leaders I talk to at companies like {{company}} are dealing with the same gap: Outreach and Salesloft tell you open rates, not outcomes. No step-level attribution to meetings or pipeline.\n\nIs that on your radar?\n\nWorth a 15-minute call to find out if there's a fit.",
        ),
        (
            "noticed something about {{company}}",
            "Hi {{first_name}},\n\nI came across {{company}} and thought our work might be relevant. We help revenue teams see exactly which steps in their sequences are generating pipeline — and which ones are quietly killing it.\n\nWould a quick call make sense?",
        ),
        (
            "pipeline attribution at {{company}}",
            "Hi {{first_name}},\n\nDo you know which step in your sequences is driving the most meetings — or are you working off sequence-level averages?\n\nMost teams are. We give you step-level clarity. Happy to show you how it works in 15 minutes.",
        ),
        (
            "{{company}} — step-level attribution",
            "Hi {{first_name}},\n\nOne thing I keep hearing from revenue leaders: the data they need to fix underperforming sequences lives in their sequencer — but no tool surfaces it at the step level.\n\nWe built something that does exactly that. Worth a look?",
        ),
    ],

    # ── Email, Step 2: follow-up referencing step 1 ────────────────────────
    ("email", 2): [
        (
            "Re: quick question, {{first_name}}",
            "Hi {{first_name}},\n\nFollowing up on my last note. I know you're busy — just wanted to make sure this didn't get buried.\n\nWe helped a similar team identify their two worst-performing steps and rewrite them based on attribution data — reply rate went from 1.1% to 3.4% in under 60 days.\n\nDoes that resonate at {{company}}?",
        ),
        (
            "following up — {{company}}",
            "Hi {{first_name}},\n\nCircling back in case my first note missed you. One thing I forgot to mention: we integrate directly with Outreach and Salesloft — no new platform to sell internally.\n\nStill worth a conversation?",
        ),
        (
            "did this land, {{first_name}}?",
            "Hi {{first_name}},\n\nJust making sure my last message reached you. Short version: we give you step-level attribution across your outbound sequences so you can see exactly where pipeline is being won or lost.\n\nIf timing is off, happy to reconnect next quarter.",
        ),
        (
            "one more thought for {{company}}",
            "Hi {{first_name}},\n\nWanted to add something I forgot to mention — we also flag underperforming steps automatically so your team isn't guessing which copy to rewrite.\n\nWould it be useful to see a sample diagnostic for a sequence like what {{company}} runs?",
        ),
    ],

    # ── Email, Step 3: value-add ───────────────────────────────────────────
    ("email", 3): [
        (
            "resource I thought you'd find useful",
            "Hi {{first_name}},\n\nI put together a quick breakdown of the three most common step-level failure patterns we see in B2B outbound — and what top-performing teams do differently at each one.\n\nHappy to walk you through it in 20 minutes. Let me know if that's worth your time.",
        ),
        (
            "benchmark data for {{company}}",
            "Hi {{first_name}},\n\nQuick value-add before I leave you alone: the average reply rate for step 1 in cold outbound is 2.9%. Most step 3s drop below 1%. The gap isn't the sequence — it's two specific steps.\n\nWe show you which ones. Still worth a call?",
        ),
        (
            "one framework that helped a team like yours",
            "Hi {{first_name}},\n\nSharing something concrete: a customer rewrote two underperforming steps based on our attribution output and lifted their sequence reply rate from 1.2% to 3.8% in 45 days.\n\nHappy to show you the exact diagnostic we used. Worth 20 minutes?",
        ),
        (
            "thought this might be relevant, {{first_name}}",
            "Hi {{first_name}},\n\nMost sequence optimization happens at the sequence level — you replace the whole thing. We found 80% of performance variance lives in one or two specific steps.\n\nIf that's a useful frame for {{company}}, happy to dig in together.",
        ),
    ],

    # ── Email, Step 4: breakup / closing the loop ──────────────────────────
    ("email", 4): [
        (
            "closing the loop, {{first_name}}",
            "Hi {{first_name}},\n\nI've reached out a few times — I'll keep this brief. If step-level sequence attribution isn't a priority at {{company}} right now, totally understood.\n\nIf timing changes, I'm here. And if there's a better person to loop in on your team, happy to connect with them instead.",
        ),
        (
            "last note from me",
            "Hi {{first_name}},\n\nOne last note before I close this out. If you're evaluating ways to improve outbound efficiency this quarter, I'd love 15 minutes.\n\nIf not — no hard feelings. I'll leave the door open.",
        ),
        (
            "still worth a conversation?",
            "Hi {{first_name}},\n\nI know I've been persistent — I genuinely think there's a fit here for {{company}}. But timing matters.\n\nIf now isn't right, what would make it worth revisiting next quarter?",
        ),
        (
            "{{company}} — one last question",
            "Hi {{first_name}},\n\nBefore I stop following up: is the gap in your current stack a reporting problem, a tooling problem, or a people problem?\n\nWe solve the first two. Happy to show you how — if you're open to it.",
        ),
    ],

    # ── Email, Step 5+: final / leave door open ────────────────────────────
    ("email", 5): [
        (
            "final note — {{first_name}}",
            "Hi {{first_name}},\n\nThis is my last note. If step-level attribution across your outbound sequences ever becomes a priority, feel free to reach out directly.\n\nWishing {{company}} a strong rest of the quarter.",
        ),
        (
            "leaving the door open",
            "Hi {{first_name}},\n\nI've reached out several times — I'll stop here. If you ever want to understand exactly which steps in your sequences are generating pipeline and which are costing you meetings, I'm one message away.\n\nTake care.",
        ),
        (
            "{{company}} — worth reconnecting?",
            "Hi {{first_name}},\n\nFinal note from me. If the ROI case for attribution-driven sequence optimization ever lands differently, I'd love to reconnect.\n\nGood luck with the quarter.",
        ),
        (
            "wrapping up — {{first_name}}",
            "Hi {{first_name}},\n\nClosing the loop on my side. I genuinely think this would help {{company}}'s outbound motion — but I also respect that now may not be the right time.\n\nFeel free to reach out whenever it is.",
        ),
    ],

    # ── Call, Step 1: cold intro call ──────────────────────────────────────
    ("call", 1): [
        (
            None,
            "Cold intro call. Introduce yourself and reference outbound context. Ask: 'Do you have 2 minutes?' Goal: confirm you have the right person, qualify fit, book a follow-up.",
        ),
        (
            None,
            "Intro call — qualify fit. Lead with the problem: most sequencers give sequence-level data, not step-level attribution. Ask: 'Is that something your team has looked at?' Goal: book a discovery call.",
        ),
        (
            None,
            "First call attempt. State your name and company. Mention you sent an email last week about step-level attribution. Ask if they have 2 minutes to hear a quick hypothesis about their sequence performance.",
        ),
    ],

    # ── Call, Step 2: follow-up call ───────────────────────────────────────
    ("call", 2): [
        (
            None,
            "Follow-up call. Reference your first email. Ask if they had a chance to see it. Briefly restate the problem. Goal: get a yes/no or schedule a proper discovery call.",
        ),
        (
            None,
            "Second touch call. Confirm receipt of your email. Offer to send a calendar link if they're interested. Keep it under 60 seconds — let them respond.",
        ),
        (
            None,
            "Follow-up call attempt. Mention the step-level attribution angle. Ask: 'Is outbound efficiency on your radar this quarter?' If yes, offer a 15-minute walk-through.",
        ),
    ],

    # ── Call, Step 3: value-add call ───────────────────────────────────────
    ("call", 3): [
        (
            None,
            "Value-add call. Lead with a benchmark: 'I was going to email you a stat about step-level reply rates — wanted to share it live instead. The average drop from step 1 to step 3 is 65%. Do you have 2 minutes?' Goal: trigger curiosity.",
        ),
        (
            None,
            "Mid-sequence call. Reference prior outreach. Ask directly: 'Is now a bad time, or is this genuinely not a fit?' Goal: get a clear signal so you stop wasting each other's time.",
        ),
        (
            None,
            "Value-add call. Offer to share a quick diagnostic framework for identifying underperforming sequence steps. Ask: 'Would it be useful to see what that looks like for a sequence like yours?'",
        ),
    ],

    # ── Call, Step 4+: breakup call ────────────────────────────────────────
    ("call", 4): [
        (
            None,
            "Breakup call. Keep it under 30 seconds. 'Hey {{first_name}}, I've reached out a few times and don't want to keep chasing. If attribution-driven outbound ever makes sense for {{company}}, I'm easy to find.' Leave on good terms — no pressure.",
        ),
        (
            None,
            "Final call attempt. Acknowledge the prior outreach, give them an easy out. 'If this isn't the right time, I completely understand — just wanted to close the loop.' Mark closed in CRM if no response.",
        ),
        (
            None,
            "Closing call. One last attempt before removing from sequence. Ask: 'Is there a better time to reconnect, or should I close this out?' Respect whatever answer you get.",
        ),
    ],

}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def type_category(step_type: str) -> str:
    return "email" if step_type.lower() in EMAIL_TYPES else "call"


def step_bucket(step_number: int) -> int:
    return min(step_number, 5)


def pick_copy(step_id: str, step_number: int, step_type: str) -> tuple[str | None, str]:
    """Return (subject, body_text) for this step. Subject is None for call steps."""
    cat = type_category(step_type)
    bucket = step_bucket(step_number)
    key = (cat, bucket)

    # Call steps clamp at 4, not 5
    if cat == "call" and bucket > 4:
        key = ("call", 4)

    variants = COPY.get(key)
    if not variants:
        # Fallback: use bucket 4 for the same category
        variants = COPY.get((cat, 4), [])

    # Seed per step_id so the same step always gets the same variant
    seed = int(step_id) if step_id.isdigit() else hash(step_id) & 0xFFFFFFFF
    rng = random.Random(seed)
    return rng.choice(variants)


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------

def backfill(sb: Client) -> None:
    resp = sb.table("sequence_steps").select(
        "step_id, sequence_id, step_number, step_type, display_name, source"
    ).execute()

    rows = resp.data
    if not rows:
        raise RuntimeError("sequence_steps returned no rows — check connection")

    print(f"Fetched {len(rows)} rows from sequence_steps")

    updated = 0
    errors = 0
    for row in rows:
        step_id = row["step_id"]
        step_number = row["step_number"] or 1
        step_type = row["step_type"] or "auto_email"

        subject, body_text = pick_copy(step_id, step_number, step_type)

        result = (
            sb.table("sequence_steps")
            .update({"subject": subject, "body_text": body_text})
            .eq("step_id", step_id)
            .execute()
        )

        if not result.data:
            print(f"  WARNING: update returned no data for step_id={step_id}")
            errors += 1
        else:
            updated += 1

    print(f"Updated: {updated}  Errors: {errors}")

    # Confirmation: fetch 5 rows and print step_id, subject, first 80 chars of body
    print("\n--- Confirmation sample (5 rows) ---")
    sample = (
        sb.table("sequence_steps")
        .select("step_id, step_number, step_type, subject, body_text")
        .order("step_id")
        .limit(5)
        .execute()
    )
    for r in sample.data:
        body_preview = (r["body_text"] or "")[:80].replace("\n", " ")
        print(f"  step_id={r['step_id']}  step={r['step_number']}  type={r['step_type']}")
        print(f"    subject:  {r['subject']}")
        print(f"    body[:80]: {body_preview}")
        print()


if __name__ == "__main__":
    sb = get_supabase()
    backfill(sb)
