"""
scripts/live_rewrite_test.py
Phase 5 Step 3: Live API test — runs the full pipeline including Claude API calls
for 5 test steps across different personas. Does NOT write to rewrite_suggestions.
"""

import os
import sys
import re
from pathlib import Path

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from classifier.performance import classify_performance
from classifier.copy_analysis import analyze_copy
from classifier.post_classify import post_classify
from classifier.router import route
from classifier.context_lookup import build_context
from prompts.rewrite import generate_rewrite

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)
if not ANTHROPIC_API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not set in .env")
    sys.exit(1)

TEST_STEP_IDS = ["5003", "5006", "5012", "5043", "6038"]

# Part 3 methodology names for quality check
PART3_METHODOLOGIES = [
    "challenger", "meddpicc", "meddic", "gap selling", "sandler",
    "spin", "command of the message", "force management",
    "value selling", "provocative", "insight",
]

# Part 4 rewrite direction names for quality check
PART4_DIRECTIONS = [
    "problem_flip", "personalization_repair", "persona_recalibration",
    "methodology_swap", "cta_simplification", "compression",
    "challenger_reframe", "social_proof_injection", "stage_realignment",
    "breakup_sharpening", "sandler_reverse", "subject_alignment",
    "followup_fresh_angle", "vertical_pain_injection",
]


def _count_words(text: str | None) -> int:
    if not text:
        return 0
    return len(text.split())


def _count_subject_words(text: str | None) -> int:
    if not text:
        return 0
    return len(text.split())


def _has_single_cta(text: str | None) -> bool:
    """Heuristic: single CTA = at most one question mark or CTA-like phrase."""
    if not text:
        return False
    questions = text.count("?")
    return questions <= 1


def _preserves_template_vars(original: str | None, suggested: str | None) -> bool:
    """Check if template variables in original are preserved in suggested."""
    if not original or not suggested:
        return True
    orig_vars = set(re.findall(r'\{\{?\w+\}?\}', original))
    if not orig_vars:
        return True
    sugg_vars = set(re.findall(r'\{\{?\w+\}?\}', suggested))
    return orig_vars.issubset(sugg_vars)


def _references_fm_by_name(diagnosis: str | None) -> bool:
    """Check if diagnosis references a specific failure mode name."""
    if not diagnosis:
        return False
    fm_names = [
        "feature-led", "feature led", "fake personalization",
        "wrong persona", "cta overload", "too long", "too dense",
        "too vague", "too safe", "methodology mismatch",
        "buying stage", "breakup", "subject-body", "subject body",
        "misalignment", "personalization",
    ]
    diag_lower = diagnosis.lower()
    return any(name in diag_lower for name in fm_names)


def _references_methodology(methodology_used: str | None) -> bool:
    """Check if methodology references a Part 3 framework."""
    if not methodology_used:
        return False
    meth_lower = methodology_used.lower()
    return any(m in meth_lower for m in PART3_METHODOLOGIES)


def _references_directions(directions: list | None) -> bool:
    """Check if rewrite_directions contains named Part 4 directions."""
    if not directions:
        return False
    for d in directions:
        d_lower = d.lower().replace(" ", "_")
        if any(pd in d_lower for pd in PART4_DIRECTIONS):
            return True
    return len(directions) > 0


def main():
    conn = psycopg2.connect(
        DATABASE_URL, connect_timeout=15, sslmode="require",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        cur = conn.cursor()
        cur.execute("SELECT MAX(snapshot_date) AS d FROM step_performance")
        latest = cur.fetchone()["d"]
        if not latest:
            print("ERROR: No pipeline data found")
            sys.exit(1)

        print(f"Latest snapshot date: {latest}")
        print(f"Running 5 live rewrites (Claude API calls)...\n")

        results = []

        for step_id in TEST_STEP_IDS:
            # Fetch step metrics
            cur.execute(
                """
                SELECT source, sequence_id, sequence_name, step_id, step_number,
                       step_type, send_volume, open_rate, reply_rate, meeting_rate,
                       health_score_v2, flag_type, flag_confidence,
                       step_intent, position_expected_rate, bayesian_reply_rate,
                       flag_reasons, pipeline_run_id
                FROM step_performance
                WHERE snapshot_date = %s AND step_id = %s
                LIMIT 1
                """,
                (latest, step_id),
            )
            step = dict(cur.fetchone())

            # Fetch step copy
            cur.execute(
                "SELECT subject, body_text FROM sequence_steps WHERE step_id = %s LIMIT 1",
                (step_id,),
            )
            copy_row = cur.fetchone()
            step_copy_subject = copy_row["subject"] if copy_row else None
            step_copy_body = copy_row["body_text"] if copy_row else None

            # Build context
            context = build_context(
                step_row=step,
                sequence_id=step["sequence_id"],
                source=step["source"],
                step_number=step["step_number"],
                db_cursor=cur,
                latest_date=latest,
            )

            # Sequence avg reply
            cur.execute(
                """
                SELECT AVG(reply_rate) AS avg_reply
                FROM step_performance
                WHERE sequence_id = %s AND source = %s AND snapshot_date = %s
                """,
                (step["sequence_id"], step["source"], latest),
            )
            avg_row = cur.fetchone()
            seq_avg_reply = float(avg_row["avg_reply"]) if avg_row and avg_row["avg_reply"] else 0.0

            # Pipeline stages
            perf_result = classify_performance(
                open_rate=float(step["open_rate"]),
                reply_rate=float(step["reply_rate"]),
                meeting_rate=float(step["meeting_rate"]),
                sequence_avg_reply=seq_avg_reply,
                step_number=step["step_number"],
                max_step_number=context["max_step_number"],
            )
            copy_result = analyze_copy(
                subject=step_copy_subject,
                body_text=step_copy_body,
                step_number=step["step_number"],
                max_step_number=context["max_step_number"],
            )
            classifier_output = post_classify(perf_result, copy_result, context)
            routed = route(classifier_output, context)

            # Build step_data
            step_data = {
                "step_id": step["step_id"],
                "sequence_name": step["sequence_name"],
                "step_number": step["step_number"],
                "max_step_number": context["max_step_number"],
                "open_rate": float(step["open_rate"]),
                "reply_rate": float(step["reply_rate"]),
                "meeting_rate": float(step["meeting_rate"]),
                "subject": step_copy_subject,
                "body_text": step_copy_body,
            }

            # LIVE API CALL
            print(f"Calling Claude for step {step_id} ({context['persona_name']})...")
            result = generate_rewrite(step_data, classifier_output, context, routed)

            if result.get("error"):
                print(f"  ERROR: Parse failure — raw response saved")
                print(f"  Raw: {result.get('raw_response', '')[:200]}...")
                print()
                continue

            fms = classifier_output["detected_failure_modes"]
            fm_list = [f"{fm['code']}:{fm['name']}" for fm in fms]

            print(f"\n=== Rewrite: Step {step_id} | {step['sequence_name']} ===")
            print(f"Signal class: {classifier_output['final_signal_class']}")
            print(f"Detected FMs: {', '.join(fm_list)}")
            print()
            print("DIAGNOSIS:")
            print(result.get("diagnosis", "N/A"))
            print()
            print("METHODOLOGY:")
            print(result.get("methodology_used", "N/A"))
            print()
            print("DIRECTIONS APPLIED:")
            print(result.get("rewrite_directions", []))
            print()
            print(f"ORIGINAL SUBJECT: {step_copy_subject}")
            print(f"SUGGESTED SUBJECT: {result.get('suggested_subject')}")
            print()
            print("ORIGINAL BODY:")
            print(step_copy_body or "N/A")
            print()
            print("SUGGESTED BODY:")
            print(result.get("suggested_body", "N/A"))
            print()
            print(f"CONFIDENCE: {result.get('confidence')}")
            print()
            print("EXPLANATION:")
            print(result.get("explanation", "N/A"))
            print()
            print(f"Token estimate: {routed.get('token_estimate')}")
            print(f"Model: {result.get('model_used')}")
            print()
            print("-" * 70)
            print()

            # Collect for quality checklist
            results.append({
                "step_id": step_id,
                "persona": context["persona_name"],
                "signal_class": classifier_output["final_signal_class"],
                "result": result,
                "original_subject": step_copy_subject,
                "original_body": step_copy_body,
            })

        # --- Quality Checklist ---
        print("=" * 70)
        print("QUALITY CHECKLIST")
        print("=" * 70)
        print()

        all_pass = True
        for r in results:
            res = r["result"]
            step_id = r["step_id"]
            persona = r["persona"]
            print(f"Step {step_id} ({persona}):")

            checks = [
                (
                    "Diagnosis references specific FM by name",
                    _references_fm_by_name(res.get("diagnosis")),
                ),
                (
                    "Methodology names a Part 3 framework",
                    _references_methodology(res.get("methodology_used")),
                ),
                (
                    "Rewrite directions from Part 4",
                    _references_directions(res.get("rewrite_directions")),
                ),
                (
                    "Suggested body under 100 words",
                    _count_words(res.get("suggested_body")) <= 100,
                ),
                (
                    "Single CTA in body",
                    _has_single_cta(res.get("suggested_body")),
                ),
                (
                    "Subject line <= 7 words",
                    _count_subject_words(res.get("suggested_subject")) <= 7,
                ),
                (
                    "Template variables preserved",
                    _preserves_template_vars(r["original_body"], res.get("suggested_body")),
                ),
                (
                    "Confidence is HIGH/MEDIUM/LOW",
                    res.get("confidence") in ("HIGH", "MEDIUM", "LOW"),
                ),
            ]

            for label, passed in checks:
                status = "PASS" if passed else "FAIL"
                if not passed:
                    all_pass = False
                print(f"  [{'x' if passed else ' '}] {label}: {status}")

            # Show word counts for body/subject
            body_wc = _count_words(res.get("suggested_body"))
            subj_wc = _count_subject_words(res.get("suggested_subject"))
            print(f"      (body: {body_wc} words, subject: {subj_wc} words)")
            print()

        if all_pass:
            print("ALL CHECKS PASSED")
        else:
            print("SOME CHECKS FAILED — review output above")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
