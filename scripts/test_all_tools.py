"""
scripts/test_all_tools.py
Phase 5 Step 5: Regression check — verify all 6 MCP tools still work.
Makes 1 Claude API call (get_rewrite_suggestion for step 5008).
"""

import os
import sys
import json
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from mcp_server.server import (
    get_sequence_health,
    get_step_breakdown,
    get_underperforming_steps,
    get_rewrite_suggestion,
    compare_sequences,
    get_step_copy,
)


def test_get_sequence_health():
    """Tool 1: get_sequence_health — should return non-empty list."""
    result = get_sequence_health()
    assert isinstance(result, list), f"Expected list, got {type(result)}"
    assert len(result) > 0, "Expected non-empty list"
    # Verify structure of first row
    row = result[0]
    required_keys = ["source", "sequence_id", "sequence_name", "avg_health_score"]
    for k in required_keys:
        assert k in row, f"Missing key: {k}"
    return f"PASS — {len(result)} sequences returned"


def test_get_step_breakdown():
    """Tool 2: get_step_breakdown(sequence_id='1001') — CISO sequence steps."""
    result = get_step_breakdown(sequence_id="1001")
    assert isinstance(result, list), f"Expected list, got {type(result)}"
    assert len(result) > 0, "Expected non-empty list for sequence 1001"
    # Verify structure
    row = result[0]
    required_keys = ["step_id", "step_number", "reply_rate", "flag_type"]
    for k in required_keys:
        assert k in row, f"Missing key: {k}"
    return f"PASS — {len(result)} steps returned for sequence 1001"


def test_get_underperforming_steps():
    """Tool 3: get_underperforming_steps — should return flagged steps."""
    result = get_underperforming_steps()
    assert isinstance(result, list), f"Expected list, got {type(result)}"
    assert len(result) > 0, "Expected non-empty list of flagged steps"
    # All should have flag_type != 'none'
    for row in result:
        assert row.get("flag_type") != "none", f"Step {row.get('step_id')} has flag_type='none'"
    return f"PASS — {len(result)} flagged steps returned"


def test_get_rewrite_suggestion():
    """Tool 4: get_rewrite_suggestion(step_id='5008') — VP Eng step. 1 API call."""
    result = get_rewrite_suggestion(step_id="5008")
    assert isinstance(result, dict), f"Expected dict, got {type(result)}"
    assert "error" not in result, f"Got error: {result.get('error')}"
    required_keys = [
        "suggestion_id", "step_id", "diagnosis", "suggested_subject",
        "suggested_body", "confidence", "signal_class",
    ]
    for k in required_keys:
        assert k in result, f"Missing key: {k}"
    return f"PASS — rewrite generated, signal_class={result['signal_class']}, confidence={result['confidence']}"


def test_compare_sequences():
    """Tool 5: compare_sequences(1001, 2001) — should return both sequences."""
    result = compare_sequences(sequence_id_a="1001", sequence_id_b="2001")
    assert isinstance(result, dict), f"Expected dict, got {type(result)}"
    assert "sequence_a" in result, "Missing sequence_a"
    assert "sequence_b" in result, "Missing sequence_b"
    assert isinstance(result["sequence_a"], list), "sequence_a should be a list"
    assert isinstance(result["sequence_b"], list), "sequence_b should be a list"
    len_a = len(result["sequence_a"])
    len_b = len(result["sequence_b"])
    return f"PASS — sequence_a: {len_a} steps, sequence_b: {len_b} steps"


def test_get_step_copy():
    """Tool 6: get_step_copy(step_id='5001') — should return subject + body_text."""
    result = get_step_copy(step_id="5001")
    assert isinstance(result, dict), f"Expected dict, got {type(result)}"
    assert "error" not in result, f"Got error: {result.get('error')}"
    assert "subject" in result or "body_text" in result, "Expected subject or body_text"
    has_subject = result.get("subject") is not None
    has_body = result.get("body_text") is not None
    return f"PASS — subject: {'yes' if has_subject else 'no'}, body: {'yes' if has_body else 'no'}"


def main():
    print("=== Regression Test: All 6 MCP Tools ===\n")

    tests = [
        ("1. get_sequence_health()", test_get_sequence_health),
        ("2. get_step_breakdown(sequence_id='1001')", test_get_step_breakdown),
        ("3. get_underperforming_steps()", test_get_underperforming_steps),
        ("4. get_rewrite_suggestion(step_id='5008')", test_get_rewrite_suggestion),
        ("5. compare_sequences('1001', '2001')", test_compare_sequences),
        ("6. get_step_copy(step_id='5001')", test_get_step_copy),
    ]

    results = []
    for label, test_fn in tests:
        print(f"Testing {label}...")
        try:
            msg = test_fn()
            results.append((label, True, msg))
            print(f"  {msg}\n")
        except Exception as e:
            results.append((label, False, str(e)))
            print(f"  FAIL: {e}\n")

    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    for label, ok, msg in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {label}")
    print(f"\n{passed}/{total} tools passed")

    if passed == total:
        print("ALL TOOLS WORKING")
    else:
        print("SOME TOOLS FAILED — investigate above")
        sys.exit(1)


if __name__ == "__main__":
    main()
