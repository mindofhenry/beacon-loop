"""
mcp_server/server.py
Beacon Loop MCP server — FastMCP with SSE transport.

Exposes six tools for querying attribution data and generating
Claude-powered rewrite suggestions for underperforming sequence steps.
"""

import os
import json
import sys
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastmcp import FastMCP
import anthropic

# Ensure repo root is importable for classifier / prompts / knowledge
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from classifier.performance import classify_performance
from classifier.copy_analysis import analyze_copy
from classifier.post_classify import post_classify
from classifier.router import route
from classifier.context_lookup import build_context
from prompts.rewrite import generate_rewrite

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set in .env")
if not ANTHROPIC_API_KEY:
    raise RuntimeError("ANTHROPIC_API_KEY must be set in .env")

mcp = FastMCP("beacon-loop")


def _db() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        DATABASE_URL,
        connect_timeout=15,
        sslmode="require",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _latest_run_date(cur) -> str | None:
    cur.execute("SELECT MAX(snapshot_date) AS d FROM step_performance")
    row = cur.fetchone()
    return row["d"] if row else None


# ---------------------------------------------------------------------------
# Tool: get_sequence_health
# ---------------------------------------------------------------------------

@mcp.tool()
def get_sequence_health() -> list[dict[str, Any]]:
    """
    Return a summary row per sequence from the latest pipeline run.

    Each row contains: source, sequence_id, sequence_name,
    avg_health_score, flagged_step_count, total_send_volume,
    avg_reply_rate, avg_meeting_rate, step_count, step_intents.
    Uses health_score_v2 (pipeline-computed Bayesian score).
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return []

        cur.execute(
            """
            SELECT
                source,
                sequence_id,
                MAX(sequence_name)                         AS sequence_name,
                COUNT(*)                                   AS step_count,
                SUM(send_volume)                           AS total_send_volume,
                ROUND(AVG(health_score_v2)::numeric, 4)    AS avg_health_score,
                ROUND(AVG(reply_rate)::numeric, 4)         AS avg_reply_rate,
                ROUND(AVG(meeting_rate)::numeric, 4)       AS avg_meeting_rate,
                SUM(CASE WHEN flag_type != 'none' THEN 1 ELSE 0 END) AS flagged_step_count,
                ARRAY_AGG(DISTINCT step_intent)            AS step_intents
            FROM step_performance
            WHERE snapshot_date = %s
            GROUP BY source, sequence_id
            ORDER BY avg_health_score ASC
            """,
            (latest,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            for k in ("avg_health_score", "avg_reply_rate", "avg_meeting_rate"):
                if r[k] is not None:
                    r[k] = float(r[k])
            # Convert psycopg2 list to plain list
            if r.get("step_intents"):
                r["step_intents"] = list(r["step_intents"])
        return rows
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tool: get_step_breakdown
# ---------------------------------------------------------------------------

@mcp.tool()
def get_step_breakdown(sequence_id: str, step_id: str | None = None) -> list[dict[str, Any]]:
    """
    Return step-level performance detail for a sequence from the latest run.

    Pass step_id to narrow to a single step. Results are ordered by step_number.
    Each row includes rate columns, health_score_v2, flag_type, flag_confidence,
    step_intent, position_expected_rate, bayesian_reply_rate, and flag_reasons.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return []

        columns = """source, sequence_id, sequence_name, step_id, step_number,
                     step_type, send_volume, open_rate, click_rate, reply_rate,
                     meeting_rate, opp_created_rate, closed_won_rate,
                     pipeline_value, health_score_v2, flag_type, flag_confidence,
                     step_intent, position_expected_rate, bayesian_reply_rate,
                     flag_reasons"""

        if step_id:
            cur.execute(
                f"""
                SELECT {columns}
                FROM step_performance
                WHERE snapshot_date = %s
                  AND sequence_id = %s
                  AND step_id = %s
                ORDER BY step_number
                """,
                (latest, sequence_id, step_id),
            )
        else:
            cur.execute(
                f"""
                SELECT {columns}
                FROM step_performance
                WHERE snapshot_date = %s
                  AND sequence_id = %s
                ORDER BY step_number
                """,
                (latest, sequence_id),
            )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            for k in ("open_rate", "click_rate", "reply_rate", "meeting_rate",
                      "opp_created_rate", "closed_won_rate", "health_score_v2",
                      "flag_confidence", "position_expected_rate", "bayesian_reply_rate"):
                if r.get(k) is not None:
                    r[k] = float(r[k])
            if r.get("pipeline_value") is not None:
                r["pipeline_value"] = float(r["pipeline_value"])
        return rows
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tool: get_underperforming_steps
# ---------------------------------------------------------------------------

@mcp.tool()
def get_underperforming_steps(
    min_send_volume: int = 10,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Return flagged steps from the latest run, sorted by flag_confidence descending.

    Only includes steps where flag_type != 'none' and send_volume >= min_send_volume.
    Returns up to `limit` rows with step_intent and send_volume_tier.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return []

        cur.execute(
            """
            SELECT source, sequence_id, sequence_name, step_id, step_number,
                   step_type, step_intent, send_volume, send_volume_tier,
                   reply_rate, meeting_rate, health_score_v2,
                   flag_type, flag_confidence, flag_reasons
            FROM step_performance
            WHERE snapshot_date = %s
              AND flag_type != 'none'
              AND send_volume >= %s
            ORDER BY flag_confidence DESC
            LIMIT %s
            """,
            (latest, min_send_volume, limit),
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            for k in ("reply_rate", "meeting_rate", "health_score_v2", "flag_confidence"):
                if r.get(k) is not None:
                    r[k] = float(r[k])
        return rows
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tool: get_rewrite_suggestion
# ---------------------------------------------------------------------------

@mcp.tool()
def get_rewrite_suggestion(
    step_id: str,
    persona_config_id: str | None = None,
) -> dict[str, Any]:
    """
    Generate a Claude-powered diagnosis and rewrite for an underperforming step.

    Runs the full pipeline: fetch step metrics + copy, resolve persona via
    sequence_persona_map, classify performance, analyze copy, post-classify,
    route to knowledge base sections, then call Claude for a methodology-grounded
    rewrite. Stores full diagnostic output in rewrite_suggestions.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return {"error": "No pipeline data found"}

        # 1. Fetch step metrics from step_performance
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
            return {"error": f"No step found with step_id={step_id!r} in latest run"}
        step = dict(step)

        # 2. Fetch step copy from sequence_steps
        cur.execute(
            "SELECT subject, body_text FROM sequence_steps WHERE step_id = %s LIMIT 1",
            (step_id,),
        )
        copy_row = cur.fetchone()
        step_copy_subject = copy_row["subject"] if copy_row else None
        step_copy_body = copy_row["body_text"] if copy_row else None

        # 3. Build context via sequence_persona_map
        context = build_context(
            step_row=step,
            sequence_id=step["sequence_id"],
            source=step["source"],
            step_number=step["step_number"],
            db_cursor=cur,
            latest_date=latest,
        )

        # 4. Compute sequence average reply rate
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

        # 5. Run the pre-classifier pipeline
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

        # 6. Build step_data for prompt assembly
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

        # 7. Call Claude via the full prompt pipeline
        result = generate_rewrite(step_data, classifier_output, context, routed)

        # Resolve persona_config_id for storage
        stored_persona_id = context.get("persona_config_id")
        if not stored_persona_id and persona_config_id:
            stored_persona_id = persona_config_id

        # 8. Persist to rewrite_suggestions with new diagnostic columns
        cur.execute(
            """
            INSERT INTO rewrite_suggestions
                (step_id, sequence_id, sequence_name, step_number,
                 persona_config_id, diagnosis, suggested_subject, suggested_body,
                 confidence, explanation, model_used, pipeline_run_id,
                 failure_modes_detected, methodology_used, rewrite_directions,
                 signal_class, step_copy_snapshot)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                step["step_id"],
                step["sequence_id"],
                step["sequence_name"],
                step["step_number"],
                stored_persona_id,
                result.get("diagnosis"),
                result.get("suggested_subject"),
                result.get("suggested_body"),
                result.get("confidence"),
                result.get("explanation"),
                result.get("model_used", "claude-sonnet-4-6"),
                step["pipeline_run_id"],
                json.dumps(classifier_output["detected_failure_modes"]),
                result.get("methodology_used"),
                json.dumps(result.get("rewrite_directions", [])),
                classifier_output["final_signal_class"],
                json.dumps({"subject": step_copy_subject, "body": step_copy_body}),
            ),
        )
        conn.commit()
        suggestion_id = cur.fetchone()["id"]

        # 9. Return full result
        return {
            "suggestion_id": str(suggestion_id),
            "step_id": step["step_id"],
            "sequence_name": step["sequence_name"],
            "step_number": step["step_number"],
            "persona": context["persona_name"],
            "diagnosis": result.get("diagnosis"),
            "methodology_used": result.get("methodology_used"),
            "rewrite_directions": result.get("rewrite_directions"),
            "suggested_subject": result.get("suggested_subject"),
            "suggested_body": result.get("suggested_body"),
            "confidence": result.get("confidence"),
            "explanation": result.get("explanation"),
            "signal_class": classifier_output["final_signal_class"],
            "failure_modes": classifier_output["detected_failure_modes"],
            "token_estimate": routed.get("token_estimate"),
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tool: compare_sequences
# ---------------------------------------------------------------------------

@mcp.tool()
def compare_sequences(
    sequence_id_a: str,
    sequence_id_b: str,
) -> dict[str, Any]:
    """
    Side-by-side step-level comparison of two sequences from the latest run.

    Returns {"sequence_a": [...], "sequence_b": [...]} where each list contains
    step rows ordered by step_number with key performance metrics.
    Uses health_score_v2 for comparison.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return {"sequence_a": [], "sequence_b": []}

        result = {}
        for key, seq_id in [("sequence_a", sequence_id_a), ("sequence_b", sequence_id_b)]:
            cur.execute(
                """
                SELECT step_id, step_number, step_type, step_intent,
                       send_volume, reply_rate, meeting_rate,
                       health_score_v2, flag_type, flag_confidence,
                       sequence_name, source
                FROM step_performance
                WHERE snapshot_date = %s AND sequence_id = %s
                ORDER BY step_number
                """,
                (latest, seq_id),
            )
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                for k in ("reply_rate", "meeting_rate", "health_score_v2", "flag_confidence"):
                    if r.get(k) is not None:
                        r[k] = float(r[k])
            result[key] = rows

        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tool: get_step_copy
# ---------------------------------------------------------------------------

@mcp.tool()
def get_step_copy(step_id: str) -> dict[str, Any]:
    """
    Return the subject line and body for a sequence step by step_id.

    Looks up the sequence_steps table and returns subject, body_text,
    and source (outreach or salesloft). Returns an error key if the
    step_id is not found.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT step_id, source, subject, body_text
            FROM sequence_steps
            WHERE step_id = %s
            LIMIT 1
            """,
            (step_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"error": f"No step found with step_id={step_id!r}"}
        return dict(row)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if os.environ.get("PORT"):
        # Railway: PORT is always injected — use SSE
        mcp.run(transport="sse", host="0.0.0.0", port=int(os.environ.get("PORT")))
    else:
        # Claude Desktop: spawns via stdio, no PORT set
        mcp.run(transport="stdio")
