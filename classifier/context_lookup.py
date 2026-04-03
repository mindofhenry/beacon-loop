"""Context assembly — resolve persona, sequence stage, and prior subjects for a step."""

import sys
from math import ceil


def build_context(step_row, sequence_id, source, step_number, db_cursor, latest_date):
    """Build the context dict that post_classify and route expect.

    Args:
        step_row: dict row from step_performance (unused beyond pass-through;
            caller already has it — kept for future expansion).
        sequence_id: str — the sequence to look up.
        source: str — 'outreach' or 'salesloft'.
        step_number: int — current step number.
        db_cursor: psycopg2 cursor (RealDictCursor).
        latest_date: str or date — snapshot_date for step_performance queries.

    Returns:
        dict with keys: persona_tier, persona_name, deal_type, vertical,
        sequence_stage, max_step_number, prior_step_subjects, persona_config_id.
    """
    # --- 1. Persona lookup via sequence_persona_map ---
    db_cursor.execute(
        """
        SELECT pc.id AS persona_config_id, pc.name, pc.persona_tier,
               spm.deal_type, spm.vertical
        FROM sequence_persona_map spm
        JOIN persona_configs pc ON spm.persona_config_id = pc.id
        WHERE spm.sequence_id = %s AND spm.source = %s
        """,
        (sequence_id, source),
    )
    persona_row = db_cursor.fetchone()

    if persona_row:
        persona_name = persona_row["name"]
        persona_tier = persona_row["persona_tier"]
        deal_type = persona_row["deal_type"]
        vertical = persona_row["vertical"]
        persona_config_id = persona_row["persona_config_id"]
    else:
        print(
            f"WARNING: No sequence_persona_map row for "
            f"sequence_id={sequence_id!r}, source={source!r}. "
            f"Using defaults.",
            file=sys.stderr,
        )
        persona_name = "VP Sales"
        persona_tier = "VP/Director"
        deal_type = "mid-market"
        vertical = None
        persona_config_id = None

    # --- 2. Max step number for this sequence ---
    db_cursor.execute(
        """
        SELECT MAX(step_number) AS max_step
        FROM step_performance
        WHERE sequence_id = %s AND source = %s AND snapshot_date = %s
        """,
        (sequence_id, source, latest_date),
    )
    max_row = db_cursor.fetchone()
    max_step_number = max_row["max_step"] if max_row and max_row["max_step"] else step_number

    # --- 3. Prior step subjects ---
    db_cursor.execute(
        """
        SELECT subject
        FROM sequence_steps
        WHERE sequence_id = %s AND source = %s
          AND step_number < %s AND subject IS NOT NULL
        ORDER BY step_number
        """,
        (sequence_id, source, step_number),
    )
    prior_step_subjects = [r["subject"] for r in db_cursor.fetchall()]

    # --- 4. Sequence stage derivation ---
    if step_number == 1:
        sequence_stage = "first_touch"
    elif step_number == max_step_number:
        sequence_stage = "breakup"
    elif step_number <= ceil(max_step_number * 0.4):
        sequence_stage = "follow_up_early"
    else:
        sequence_stage = "follow_up_late"

    return {
        "persona_tier": persona_tier,
        "persona_name": persona_name,
        "deal_type": deal_type,
        "vertical": vertical,
        "sequence_stage": sequence_stage,
        "max_step_number": max_step_number,
        "prior_step_subjects": prior_step_subjects,
        "persona_config_id": persona_config_id,
    }
