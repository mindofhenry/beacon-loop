"""
validate_attribution.py
Post-run validation for the Beacon Loop attribution pipeline.

Queries Supabase and checks acceptance criteria. Prints results to console.
Exit code 0 = all pass, exit code 1 = any failure.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def check(label: str, passed: bool, detail: str = "") -> bool:
    status = "PASS" if passed else "FAIL"
    msg = f"  [{status}] {label}"
    if not passed and detail:
        msg += f"\n         {detail}"
    print(msg)
    return passed


def main() -> int:
    print("=" * 64)
    print("Beacon Loop — Attribution Pipeline Validation")
    print("=" * 64)

    sb = get_supabase()
    all_pass = True

    # ── 1. Pipeline run completed ─────────────────────────────────────
    runs = (
        sb.table("pipeline_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    run = runs.data[0] if runs.data else None
    ok = check(
        "1. Pipeline run exists and completed",
        run is not None and run.get("status") == "completed",
        f"status={run.get('status') if run else 'NO RUNS FOUND'}",
    )
    all_pass = all_pass and ok

    if not run:
        print("\nNo pipeline run found. Remaining checks skipped.")
        return 1

    run_id = run["id"]
    print(f"     Run ID: {run_id}")

    # ── 2. Touchpoints written ────────────────────────────────────────
    tp_count = run.get("touchpoints_written", 0)
    ok = check(
        "2. Touchpoints written > 0",
        tp_count > 0,
        f"touchpoints_written={tp_count}",
    )
    all_pass = all_pass and ok

    # ── 3. Snapshots written ──────────────────────────────────────────
    snap_count = run.get("snapshots_written", 0)
    ok = check(
        "3. Snapshots written > 0",
        snap_count > 0,
        f"snapshots_written={snap_count}",
    )
    all_pass = all_pass and ok

    # Count distinct steps across both sources in step_performance for this run
    perf_rows = (
        sb.table("step_performance")
        .select("source, step_id")
        .eq("pipeline_run_id", run_id)
        .execute()
    )
    unique_steps = set()
    for r in perf_rows.data:
        unique_steps.add((r["source"], r["step_id"]))
    ok = check(
        "   Snapshot count matches unique steps",
        snap_count == len(unique_steps),
        f"snapshots_written={snap_count}, unique (source,step_id) pairs={len(unique_steps)}",
    )
    all_pass = all_pass and ok

    # ── 4. Both sources present ───────────────────────────────────────
    sources_present = set(r["source"] for r in perf_rows.data)
    ok = check(
        "4. Both sources present (outreach + salesloft)",
        "outreach" in sources_present and "salesloft" in sources_present,
        f"sources found: {sources_present}",
    )
    all_pass = all_pass and ok

    # ── 5. Flagging works ─────────────────────────────────────────────
    flagged_rows = (
        sb.table("step_performance")
        .select("step_id, source, flagged")
        .eq("pipeline_run_id", run_id)
        .eq("flagged", True)
        .execute()
    )
    flagged_count = len(flagged_rows.data)
    ok = check(
        "5. At least one step flagged",
        flagged_count > 0,
        f"flagged rows: {flagged_count}",
    )
    all_pass = all_pass and ok

    # ── 6. Health score bounds ────────────────────────────────────────
    all_perf = (
        sb.table("step_performance")
        .select("step_id, health_score")
        .eq("pipeline_run_id", run_id)
        .execute()
    )
    bad_scores = [
        r for r in all_perf.data
        if r["health_score"] is not None and (
            float(r["health_score"]) < 0.0 or float(r["health_score"]) > 1.0
        )
    ]
    ok = check(
        "6. All health_score values in [0.0, 1.0]",
        len(bad_scores) == 0,
        f"out-of-range: {bad_scores[:5]}",
    )
    all_pass = all_pass and ok

    # ── 7. No null step_numbers ───────────────────────────────────────
    null_steps = (
        sb.table("step_performance")
        .select("step_id, step_number")
        .eq("pipeline_run_id", run_id)
        .is_("step_number", "null")
        .execute()
    )
    ok = check(
        "7. No null step_number values",
        len(null_steps.data) == 0,
        f"null step_numbers: {len(null_steps.data)}",
    )
    all_pass = all_pass and ok

    # ── 8. Pipeline value present ─────────────────────────────────────
    pv_rows = (
        sb.table("step_performance")
        .select("step_id, pipeline_value")
        .eq("pipeline_run_id", run_id)
        .gt("pipeline_value", 0)
        .execute()
    )
    ok = check(
        "8. At least one step has pipeline_value > 0",
        len(pv_rows.data) > 0,
        f"steps with pipeline_value > 0: {len(pv_rows.data)}",
    )
    all_pass = all_pass and ok

    # ── Summary ───────────────────────────────────────────────────────
    print()
    if all_pass:
        print("Result: ALL CHECKS PASSED")
    else:
        print("Result: VALIDATION FAILED — see FAIL lines above")
    print("=" * 64)

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
