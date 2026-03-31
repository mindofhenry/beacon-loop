"""
mcp_server/server.py
Beacon Loop MCP server — FastMCP with SSE transport.

Exposes five tools for querying attribution data and generating
Claude-powered rewrite suggestions for underperforming sequence steps.
"""

import os
import json
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastmcp import FastMCP
import anthropic

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
    avg_reply_rate, avg_meeting_rate, step_count.
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
                MAX(sequence_name)                    AS sequence_name,
                COUNT(*)                              AS step_count,
                SUM(send_volume)                      AS total_send_volume,
                ROUND(AVG(health_score)::numeric, 4)  AS avg_health_score,
                ROUND(AVG(reply_rate)::numeric, 4)    AS avg_reply_rate,
                ROUND(AVG(meeting_rate)::numeric, 4)  AS avg_meeting_rate,
                SUM(CASE WHEN flagged THEN 1 ELSE 0 END) AS flagged_step_count
            FROM step_performance
            WHERE snapshot_date = %s
            GROUP BY source, sequence_id
            ORDER BY avg_health_score ASC
            """,
            (latest,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        # psycopg2 returns Decimal for ROUND results — convert to float
        for r in rows:
            for k in ("avg_health_score", "avg_reply_rate", "avg_meeting_rate"):
                if r[k] is not None:
                    r[k] = float(r[k])
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
    Each row includes all rate columns, health_score, flagged, and flag_reasons.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return []

        if step_id:
            cur.execute(
                """
                SELECT source, sequence_id, sequence_name, step_id, step_number,
                       step_type, send_volume, open_rate, click_rate, reply_rate,
                       meeting_rate, opp_created_rate, closed_won_rate,
                       pipeline_value, health_score, flagged, flag_reasons
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
                """
                SELECT source, sequence_id, sequence_name, step_id, step_number,
                       step_type, send_volume, open_rate, click_rate, reply_rate,
                       meeting_rate, opp_created_rate, closed_won_rate,
                       pipeline_value, health_score, flagged, flag_reasons
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
                      "opp_created_rate", "closed_won_rate", "health_score"):
                if r[k] is not None:
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
    Return flagged steps from the latest run, worst health score first.

    Only includes steps where send_volume >= min_send_volume to filter out
    steps with too little data to draw conclusions. Returns up to `limit` rows.
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
                   step_type, send_volume, reply_rate, meeting_rate,
                   health_score, flag_reasons
            FROM step_performance
            WHERE snapshot_date = %s
              AND flagged = TRUE
              AND send_volume >= %s
            ORDER BY health_score ASC
            LIMIT %s
            """,
            (latest, min_send_volume, limit),
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            for k in ("reply_rate", "meeting_rate", "health_score"):
                if r[k] is not None:
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

    Looks up step metrics from step_performance and persona context from
    persona_configs (defaults to the first persona if persona_config_id is omitted).
    Calls claude-sonnet-4-6, stores the result in rewrite_suggestions, and
    returns diagnosis, suggested_subject, and suggested_body.
    """
    conn = _db()
    try:
        cur = conn.cursor()
        latest = _latest_run_date(cur)
        if not latest:
            return {"error": "No pipeline data found"}

        # Fetch step metrics
        cur.execute(
            """
            SELECT source, sequence_id, sequence_name, step_id, step_number,
                   step_type, send_volume, open_rate, reply_rate, meeting_rate,
                   health_score, flag_reasons, pipeline_run_id
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

        # Fetch persona
        if persona_config_id:
            cur.execute(
                "SELECT * FROM persona_configs WHERE id = %s",
                (persona_config_id,),
            )
        else:
            cur.execute("SELECT * FROM persona_configs ORDER BY created_at LIMIT 1")
        persona = cur.fetchone()
        if not persona:
            return {"error": "No persona_configs found — run the migration first"}
        persona = dict(persona)

        # Build prompt
        pain_points_str = ", ".join(persona.get("pain_points") or [])
        flag_reasons_str = (
            "\n  - ".join(step["flag_reasons"])
            if step.get("flag_reasons")
            else "health score below threshold"
        )

        prompt = f"""You are an expert B2B sales email copywriter analyzing an underperforming outbound sequence step.

## Step Metrics
- Source: {step["source"]}
- Sequence: {step["sequence_name"]} (ID: {step["sequence_id"]})
- Step: #{step["step_number"]} ({step["step_type"]})
- Send volume: {step["send_volume"]}
- Open rate: {float(step["open_rate"]):.1%}
- Reply rate: {float(step["reply_rate"]):.1%}
- Meeting rate: {float(step["meeting_rate"]):.1%}
- Health score: {float(step["health_score"]):.3f} / 1.000

## Why It's Flagged
  - {flag_reasons_str}

## Target Persona
- Title: {persona.get("title", "unknown")}
- Industry: {persona.get("industry", "unknown")}
- Company size: {persona.get("company_size", "unknown")}
- Pain points: {pain_points_str}
- Tone: {persona.get("tone", "professional")}
{f'- Additional context: {persona["extra_context"]}' if persona.get("extra_context") else ""}

## Your Task
Respond with a JSON object containing exactly these three keys:
1. "diagnosis": 2-3 sentences explaining why this step is underperforming based on the metrics and persona fit.
2. "suggested_subject": A single revised subject line optimized for this persona.
3. "suggested_body": A revised email body (plain text, 3-5 sentences, no placeholders except {{{{first_name}}}} and {{{{company}}}}).

Respond with raw JSON only — no markdown fences."""

        # Call Claude
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()

        # Parse JSON response
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            # Attempt to extract JSON block if model wrapped it anyway
            import re
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            parsed = json.loads(match.group()) if match else {"raw_response": raw}

        diagnosis = parsed.get("diagnosis", "")
        suggested_subject = parsed.get("suggested_subject", "")
        suggested_body = parsed.get("suggested_body", "")

        # Persist to rewrite_suggestions
        cur.execute(
            """
            INSERT INTO rewrite_suggestions
                (step_id, sequence_id, sequence_name, step_number,
                 persona_config_id, diagnosis, suggested_subject, suggested_body,
                 model_used, pipeline_run_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                step["step_id"],
                step["sequence_id"],
                step["sequence_name"],
                step["step_number"],
                persona["id"],
                diagnosis,
                suggested_subject,
                suggested_body,
                "claude-sonnet-4-6",
                step["pipeline_run_id"],
            ),
        )
        conn.commit()
        suggestion_id = cur.fetchone()["id"]

        return {
            "suggestion_id": str(suggestion_id),
            "step_id": step["step_id"],
            "sequence_name": step["sequence_name"],
            "step_number": step["step_number"],
            "persona": persona["name"],
            "diagnosis": diagnosis,
            "suggested_subject": suggested_subject,
            "suggested_body": suggested_body,
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
                SELECT step_id, step_number, step_type, send_volume,
                       reply_rate, meeting_rate, health_score, flagged,
                       sequence_name, source
                FROM step_performance
                WHERE snapshot_date = %s AND sequence_id = %s
                ORDER BY step_number
                """,
                (latest, seq_id),
            )
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                for k in ("reply_rate", "meeting_rate", "health_score"):
                    if r[k] is not None:
                        r[k] = float(r[k])
            result[key] = rows

        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=8000)
