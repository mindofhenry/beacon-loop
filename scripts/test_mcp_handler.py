"""
scripts/test_mcp_handler.py
Phase 5 Step 4: MCP server integration test — calls get_rewrite_suggestion
directly and verifies the response + database storage.
"""

import os
import sys
import json
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Import the tool function directly from the MCP server module
from mcp_server.server import get_rewrite_suggestion

DATABASE_URL = os.getenv("DATABASE_URL", "")


def main():
    print("=== MCP Handler Integration Test ===")
    print("Calling get_rewrite_suggestion(step_id='5004') — no persona_config_id (auto-resolve)")
    print("This will make 1 Claude API call.\n")

    # Call the handler
    result = get_rewrite_suggestion(step_id="5004")

    # Print full response
    print("RESPONSE:")
    print(json.dumps(result, indent=2, default=str))
    print()

    # Verify expected keys
    expected_keys = [
        "suggestion_id", "step_id", "sequence_name", "diagnosis",
        "suggested_subject", "suggested_body", "confidence", "explanation",
        "methodology_used", "rewrite_directions", "signal_class",
    ]
    missing_keys = [k for k in expected_keys if k not in result]
    if missing_keys:
        print(f"FAIL: Missing keys in response: {missing_keys}")
    else:
        print("PASS: All expected keys present in response")

    # Check for error
    if "error" in result:
        print(f"FAIL: Response contains error: {result['error']}")
        return

    # Print key fields
    print(f"\nsuggestion_id: {result.get('suggestion_id')}")
    print(f"step_id: {result.get('step_id')}")
    print(f"signal_class: {result.get('signal_class')}")
    print(f"methodology_used: {result.get('methodology_used', 'N/A')[:80]}...")
    print(f"confidence: {result.get('confidence')}")
    print(f"failure_modes: {result.get('failure_modes')}")
    print(f"rewrite_directions: {result.get('rewrite_directions')}")

    # Verify database storage
    print("\n--- Verifying database storage ---")
    conn = psycopg2.connect(
        DATABASE_URL, connect_timeout=15, sslmode="require",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, step_id, sequence_name, signal_class, methodology_used,
                   failure_modes_detected, rewrite_directions, confidence,
                   step_copy_snapshot IS NOT NULL as has_copy_snapshot
            FROM rewrite_suggestions
            ORDER BY created_at DESC
            LIMIT 1
            """,
        )
        row = cur.fetchone()
        if not row:
            print("FAIL: No rows found in rewrite_suggestions")
            return

        row = dict(row)
        print(f"\nLatest rewrite_suggestions row:")
        print(f"  id: {row['id']}")
        print(f"  step_id: {row['step_id']}")
        print(f"  sequence_name: {row['sequence_name']}")
        print(f"  signal_class: {row['signal_class']}")
        print(f"  methodology_used: {(row['methodology_used'] or '')[:80]}...")
        print(f"  failure_modes_detected: {row['failure_modes_detected']}")
        print(f"  rewrite_directions: {row['rewrite_directions']}")
        print(f"  confidence: {row['confidence']}")
        print(f"  has_copy_snapshot: {row['has_copy_snapshot']}")

        # Validation checks
        checks = {
            "signal_class not NULL": row["signal_class"] is not None,
            "methodology_used not NULL": row["methodology_used"] is not None,
            "failure_modes_detected not NULL": row["failure_modes_detected"] is not None,
            "failure_modes_detected is valid JSON": _is_valid_json_field(row["failure_modes_detected"]),
            "rewrite_directions not NULL": row["rewrite_directions"] is not None,
            "rewrite_directions is valid JSON": _is_valid_json_field(row["rewrite_directions"]),
            "has_copy_snapshot is true": row["has_copy_snapshot"] is True,
        }

        print("\nDatabase validation:")
        all_pass = True
        for label, passed in checks.items():
            status = "PASS" if passed else "FAIL"
            if not passed:
                all_pass = False
            print(f"  [{('x' if passed else ' ')}] {label}: {status}")

        if all_pass:
            print("\nALL DATABASE CHECKS PASSED")
        else:
            print("\nSOME DATABASE CHECKS FAILED")

    finally:
        conn.close()


def _is_valid_json_field(value):
    """Check if a value is valid JSON (already parsed by psycopg2 or a string)."""
    if value is None:
        return False
    if isinstance(value, (list, dict)):
        return True
    if isinstance(value, str):
        try:
            json.loads(value)
            return True
        except (json.JSONDecodeError, TypeError):
            return False
    return False


if __name__ == "__main__":
    main()
