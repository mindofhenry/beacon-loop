"""
scripts/verify_pipeline.py
Phase 5 Step 2: Dry-run the full rewrite pipeline (no Claude API calls).

Runs classify → analyze_copy → post_classify → route → build prompts
for 5 test steps across different personas.
"""

import os
import sys
from pathlib import Path

# Ensure repo root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from classifier.performance import classify_performance
from classifier.copy_analysis import analyze_copy
from classifier.post_classify import post_classify
from classifier.router import route
from classifier.context_lookup import build_context
from prompts.rewrite import build_system_prompt, build_user_message

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

# 5 test step_ids — one per target persona/sequence
TEST_STEP_IDS = ["5003", "5006", "5012", "5043", "6038"]

def main():
    conn = psycopg2.connect(
        DATABASE_URL, connect_timeout=15, sslmode="require",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        cur = conn.cursor()

        # Get latest snapshot date
        cur.execute("SELECT MAX(snapshot_date) AS d FROM step_performance")
        latest = cur.fetchone()["d"]
        if not latest:
            print("ERROR: No pipeline data found")
            sys.exit(1)
        print(f"Latest snapshot date: {latest}\n")

        summary_rows = []

        for step_id in TEST_STEP_IDS:
            # 1. Fetch step metrics
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
            step = cur.fetchone()
            if not step:
                print(f"WARNING: step_id={step_id} not found in latest run, skipping")
                continue
            step = dict(step)

            # 2. Fetch step copy
            cur.execute(
                "SELECT subject, body_text FROM sequence_steps WHERE step_id = %s LIMIT 1",
                (step_id,),
            )
            copy_row = cur.fetchone()
            step_copy_subject = copy_row["subject"] if copy_row else None
            step_copy_body = copy_row["body_text"] if copy_row else None

            # 3. Build context
            context = build_context(
                step_row=step,
                sequence_id=step["sequence_id"],
                source=step["source"],
                step_number=step["step_number"],
                db_cursor=cur,
                latest_date=latest,
            )

            # 4. Sequence average reply rate
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

            # 5. classify_performance
            perf_result = classify_performance(
                open_rate=float(step["open_rate"]),
                reply_rate=float(step["reply_rate"]),
                meeting_rate=float(step["meeting_rate"]),
                sequence_avg_reply=seq_avg_reply,
                step_number=step["step_number"],
                max_step_number=context["max_step_number"],
            )

            # 6. analyze_copy
            copy_result = analyze_copy(
                subject=step_copy_subject,
                body_text=step_copy_body,
                step_number=step["step_number"],
                max_step_number=context["max_step_number"],
            )

            # 7. post_classify
            classifier_output = post_classify(perf_result, copy_result, context)

            # 8. route
            routed = route(classifier_output, context)

            # 9. build prompts
            system_prompt = build_system_prompt(routed)
            user_message = build_user_message(
                {
                    "step_id": step["step_id"],
                    "sequence_name": step["sequence_name"],
                    "step_number": step["step_number"],
                    "max_step_number": context["max_step_number"],
                    "open_rate": float(step["open_rate"]),
                    "reply_rate": float(step["reply_rate"]),
                    "meeting_rate": float(step["meeting_rate"]),
                    "subject": step_copy_subject,
                    "body_text": step_copy_body,
                },
                classifier_output,
                context,
            )

            # --- Print structured report ---
            fms = classifier_output["detected_failure_modes"]
            fm_codes = [f"{fm['code']}:{fm['name']}" for fm in fms]
            section_keys = [s["key"] for s in routed["system_prompt_sections"]]

            print(f"=== Step {step_id} | {step['sequence_name']} | Step {step['step_number']} ===")
            print(f"Persona: {context['persona_name']} ({context['persona_tier']}) | Deal: {context['deal_type']} | Vertical: {context.get('vertical') or 'none'}")
            print(f"Sequence stage: {context['sequence_stage']}")
            print()
            print("PERFORMANCE:")
            print(f"  Signal class: {perf_result['preliminary_signal_class']}")
            print(f"  Severity: {perf_result['severity']}")
            print(f"  Open rate: {float(step['open_rate']):.1%} ({perf_result['open_rate_assessment']})")
            print(f"  Reply rate: {float(step['reply_rate']):.1%} ({perf_result['reply_rate_assessment']})")
            print()
            print("COPY ANALYSIS:")
            print(f"  Copy available: {'yes' if copy_result['copy_available'] else 'no'}")
            print(f"  Word count: {copy_result.get('word_count')}")
            print(f"  Subject words: {copy_result.get('subject_word_count')}")
            print(f"  Buzzwords: {copy_result.get('detected_buzzwords') or 'none'}")
            print(f"  I/We ratio: {copy_result.get('i_we_sentence_ratio', 0):.0%}")
            violations = []
            if copy_result.get("body_word_count_flag"):
                violations.append("body > 100 words")
            if copy_result.get("subject_word_count_flag"):
                violations.append("subject > 7 words")
            if copy_result.get("has_multiple_links"):
                violations.append("multiple links")
            print(f"  Invariant violations: {', '.join(violations) if violations else 'none'}")
            print()
            print("POST-CLASSIFICATION:")
            print(f"  Final signal class: {classifier_output['final_signal_class']}")
            print(f"  Detected FMs: {', '.join(fm_codes) if fm_codes else 'none'}")
            print(f"  Routing hints: {len(classifier_output['routing_hints'])} hints")
            print()
            print("ROUTING:")
            print(f"  Sections loaded: {len(routed['system_prompt_sections'])}")
            print(f"  Parts included: {', '.join(section_keys)}")
            print(f"  Full fallback: {'yes' if routed['is_full_fallback'] else 'no'}")
            print(f"  Token estimate: {routed['token_estimate']}")
            print()
            print("PROMPT:")
            print(f"  System prompt length: {len(system_prompt)} chars")
            print(f"  User message length: {len(user_message)} chars")
            print()
            print("-" * 70)
            print()

            summary_rows.append({
                "step_id": step_id,
                "persona": context["persona_name"],
                "signal_class": classifier_output["final_signal_class"],
                "fms": ", ".join(fm["code"] for fm in fms) if fms else "none",
                "sections": len(routed["system_prompt_sections"]),
                "tokens": routed["token_estimate"],
            })

        # --- Summary table ---
        print("SUMMARY")
        print(f"{'step_id':<8} | {'persona':<15} | {'signal_class':<25} | {'FMs detected':<15} | {'sections':>8} | {'tokens':>6}")
        print("-" * 90)
        for r in summary_rows:
            print(f"{r['step_id']:<8} | {r['persona']:<15} | {r['signal_class']:<25} | {r['fms']:<15} | {r['sections']:>8} | {r['tokens']:>6}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
