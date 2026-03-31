"""
attribution_model.py
Beacon Loop attribution pipeline.

Reads sequencer email activity (Outreach + Salesloft) and Salesforce data,
executes a step-level attribution join chain, calculates per-step performance
metrics and health scores, and writes results to Supabase.
"""

import json
import csv
import os
import sys
import uuid
from datetime import datetime, date
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# 0. Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic"

DEFAULTS = {
    "weight_reply_rate": 0.50,
    "weight_meeting_rate": 0.30,
    "weight_opp_rate": 0.20,
    "threshold_reply_rate": 0.03,
    "threshold_meeting_rate": 0.01,
    "threshold_health_score": 0.40,
}

# Health-score normalization ceilings (top-decile industry benchmarks).
REPLY_CEILING = 0.08
MEETING_CEILING = 0.04
OPP_CEILING = 0.02


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# 1. Config loading
# ---------------------------------------------------------------------------

def load_config(sb: Client) -> dict:
    """Load weights/thresholds from attribution_config or fall back to DEFAULTS."""
    try:
        resp = sb.table("attribution_config").select("*").limit(1).execute()
        if resp.data:
            row = resp.data[0]
            return {
                "weight_reply_rate": float(row["weight_reply_rate"]),
                "weight_meeting_rate": float(row["weight_meeting_rate"]),
                "weight_opp_rate": float(row["weight_opp_rate"]),
                "threshold_reply_rate": float(row["threshold_reply_rate"]),
                "threshold_meeting_rate": float(row["threshold_meeting_rate"]),
                "threshold_health_score": float(row["threshold_health_score"]),
            }
    except Exception:
        pass
    return dict(DEFAULTS)


# ---------------------------------------------------------------------------
# 2. Data loading
# ---------------------------------------------------------------------------

def _load_json(filename: str) -> list:
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


def _load_csv(filename: str) -> list[dict]:
    with open(DATA_DIR / filename, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _build_outreach_df() -> pd.DataFrame:
    """Parse Outreach email_activity.json into a flat DataFrame."""
    raw = _load_json("email_activity.json")
    sequences = {s["id"]: s["attributes"]["name"] for s in _load_json("sequences.json")}
    steps_meta = {
        s["id"]: {
            "order": s["attributes"]["order"],
            "stepType": s["attributes"]["stepType"],
        }
        for s in _load_json("sequence_steps.json")
    }

    rows = []
    for m in raw:
        attr = m["attributes"]
        rels = m["relationships"]
        seq_id = rels["sequence"]["data"]["id"]
        step_id = rels["sequenceStep"]["data"]["id"]
        meta = steps_meta.get(step_id, {})
        rows.append({
            "source": "outreach",
            "sequence_id": str(seq_id),
            "sequence_name": sequences.get(seq_id, ""),
            "step_id": str(step_id),
            "step_number": meta.get("order", 0),
            "step_type": meta.get("stepType", "email"),
            "contact_email": attr["_prospect_email"],
            "sent_at": attr.get("deliveredAt") or attr.get("scheduledAt"),
            "opened": attr.get("openCount", 0) > 0,
            "clicked": attr.get("clickCount", 0) > 0,
            "replied": attr.get("repliedAt") is not None,
        })
    return pd.DataFrame(rows)


def _build_salesloft_df() -> pd.DataFrame:
    """Parse Salesloft sl_email_activity.json into a flat DataFrame."""
    raw = _load_json("sl_email_activity.json")
    cadences = {c["id"]: c["name"] for c in _load_json("sl_cadences.json")}
    steps_meta = {
        s["id"]: {
            "step_number": s["step_number"],
            "type": s["type"],
        }
        for s in _load_json("sl_steps.json")
    }

    rows = []
    for a in raw:
        cad_id = a["cadence"]["id"]
        step_id = a["step"]["id"]
        meta = steps_meta.get(step_id, {})
        rows.append({
            "source": "salesloft",
            "sequence_id": str(cad_id),
            "sequence_name": cadences.get(cad_id, ""),
            "step_id": str(step_id),
            "step_number": meta.get("step_number", 0),
            "step_type": meta.get("type", "Email").lower(),
            "contact_email": a["_person_email"],
            "sent_at": a.get("created_at"),
            "opened": a.get("opens", 0) > 0,
            "clicked": a.get("clicks", 0) > 0,
            "replied": a.get("replies", 0) > 0,
        })
    return pd.DataFrame(rows)


def load_source_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, set[str]]:
    """
    Returns (activity_df, sf_contacts_df, sf_opps_df, sf_ocr_df, meeting_contact_ids).
    activity_df is the union of Outreach + Salesloft rows.
    meeting_contact_ids is a set of SF ContactIds that have a "Demo scheduled" task.
    """
    or_df = _build_outreach_df()
    sl_df = _build_salesloft_df()
    activity_df = pd.concat([or_df, sl_df], ignore_index=True)

    sf_contacts_df = pd.DataFrame(_load_csv("sf_contacts.csv"))
    sf_opps_df = pd.DataFrame(_load_csv("sf_opportunities.csv"))
    sf_ocr_df = pd.DataFrame(_load_csv("sf_opportunity_contact_roles.csv"))

    # Derive meeting_booked from sf_tasks: "Demo scheduled" means a meeting was booked.
    tasks = _load_csv("sf_tasks.csv")
    meeting_contact_ids = {
        t["WhoId"] for t in tasks
        if "demo" in t["Subject"].lower()
    }

    return activity_df, sf_contacts_df, sf_opps_df, sf_ocr_df, meeting_contact_ids


# ---------------------------------------------------------------------------
# 3. Attribution join chain
# ---------------------------------------------------------------------------

def resolve_opportunity(
    contact_id: str,
    sf_ocr_df: pd.DataFrame,
    sf_opps_df: pd.DataFrame,
) -> dict | None:
    """
    Given a Salesforce ContactId, find the first matched Opportunity via
    OpportunityContactRole. Returns dict with opp fields or None.

    This function signature is the expansion point for multi-touch attribution:
    change calling logic to allow multiple matches instead of first-match only.
    """
    ocr_matches = sf_ocr_df.loc[sf_ocr_df["ContactId"] == contact_id]
    if ocr_matches.empty:
        return None
    opp_id = ocr_matches.iloc[0]["OpportunityId"]
    opp_match = sf_opps_df.loc[sf_opps_df["Id"] == opp_id]
    if opp_match.empty:
        return None
    row = opp_match.iloc[0]
    return {
        "opportunity_id": row["Id"],
        "stage": row["StageName"],
        "amount": float(row["Amount"]),
    }


def run_join_chain(
    activity_df: pd.DataFrame,
    sf_contacts_df: pd.DataFrame,
    sf_opps_df: pd.DataFrame,
    sf_ocr_df: pd.DataFrame,
    meeting_contact_ids: set[str],
    pipeline_run_id: str,
) -> pd.DataFrame:
    """Execute the attribution join chain and return enriched touchpoints."""

    # Build email -> contact_id lookup
    email_to_contact = dict(
        zip(sf_contacts_df["Email"], sf_contacts_df["Id"])
    )

    # Resolve each activity row
    contact_ids = []
    opportunity_ids = []
    opp_amounts = []
    closed_wons = []
    meetings = []

    for _, row in activity_df.iterrows():
        email = row["contact_email"]
        cid = email_to_contact.get(email)
        contact_ids.append(cid)

        opp = resolve_opportunity(cid, sf_ocr_df, sf_opps_df) if cid else None
        if opp:
            opportunity_ids.append(opp["opportunity_id"])
            opp_amounts.append(opp["amount"])
            closed_wons.append(opp["stage"] == "Closed Won")
        else:
            opportunity_ids.append(None)
            opp_amounts.append(0.0)
            closed_wons.append(False)

        meetings.append(cid in meeting_contact_ids if cid else False)

    activity_df = activity_df.copy()
    activity_df["contact_id"] = contact_ids
    activity_df["opportunity_id"] = opportunity_ids
    activity_df["opp_amount"] = opp_amounts
    activity_df["closed_won"] = closed_wons
    activity_df["meeting_booked"] = meetings
    activity_df["attribution_type"] = "last_touch"
    activity_df["pipeline_run_id"] = pipeline_run_id

    return activity_df


# ---------------------------------------------------------------------------
# 4 & 5. Metric calculation, health score, flagging
# ---------------------------------------------------------------------------

def calculate_step_performance(
    touchpoints_df: pd.DataFrame,
    config: dict,
    pipeline_run_id: str,
) -> pd.DataFrame:
    """Group touchpoints by step and calculate performance metrics."""

    group_cols = ["source", "sequence_id", "sequence_name", "step_id", "step_number", "step_type"]
    snapshots = []

    for keys, grp in touchpoints_df.groupby(group_cols, dropna=False):
        source, seq_id, seq_name, step_id, step_num, step_type = keys
        sv = len(grp)
        oc = int(grp["opened"].sum())
        cc = int(grp["clicked"].sum())
        rc = int(grp["replied"].sum())
        mc = int(grp["meeting_booked"].sum())
        occ = int(grp["opportunity_id"].notna().sum())
        cwc = int(grp["closed_won"].sum())
        pv = float(grp.loc[grp["opportunity_id"].notna(), "opp_amount"].sum())

        open_rate = oc / sv if sv > 0 else 0.0
        click_rate = cc / sv if sv > 0 else 0.0
        reply_rate = rc / sv if sv > 0 else 0.0
        meeting_rate = mc / sv if sv > 0 else 0.0
        opp_created_rate = occ / sv if sv > 0 else 0.0
        closed_won_rate = cwc / sv if sv > 0 else 0.0

        # Health score
        raw_score = (
            reply_rate * config["weight_reply_rate"]
            + meeting_rate * config["weight_meeting_rate"]
            + opp_created_rate * config["weight_opp_rate"]
        )
        theoretical_max = (
            REPLY_CEILING * config["weight_reply_rate"]
            + MEETING_CEILING * config["weight_meeting_rate"]
            + OPP_CEILING * config["weight_opp_rate"]
        )
        health_score = min(raw_score / theoretical_max, 1.0) if theoretical_max > 0 else 0.0

        # Flagging
        flag_reasons = []
        if reply_rate < config["threshold_reply_rate"]:
            flag_reasons.append(
                f"Reply rate {reply_rate:.1%} below threshold {config['threshold_reply_rate']:.1%}"
            )
        if meeting_rate < config["threshold_meeting_rate"]:
            flag_reasons.append(
                f"Meeting rate {meeting_rate:.1%} below threshold {config['threshold_meeting_rate']:.1%}"
            )
        if health_score < config["threshold_health_score"]:
            flag_reasons.append(
                f"Health score {health_score:.3f} below threshold {config['threshold_health_score']:.3f}"
            )
        flagged = len(flag_reasons) > 0

        snapshots.append({
            "pipeline_run_id": pipeline_run_id,
            "snapshot_date": str(date.today()),
            "source": source,
            "sequence_id": str(seq_id),
            "sequence_name": seq_name,
            "step_id": str(step_id),
            "step_number": int(step_num),
            "step_type": step_type,
            "send_volume": sv,
            "open_count": oc,
            "click_count": cc,
            "reply_count": rc,
            "meeting_count": mc,
            "opp_created_count": occ,
            "open_rate": round(open_rate, 4),
            "click_rate": round(click_rate, 4),
            "reply_rate": round(reply_rate, 4),
            "meeting_rate": round(meeting_rate, 4),
            "opp_created_rate": round(opp_created_rate, 4),
            "pipeline_value": round(pv, 2),
            "closed_won_count": cwc,
            "closed_won_rate": round(closed_won_rate, 4),
            "health_score": round(health_score, 4),
            "flagged": flagged,
            "flag_reasons": flag_reasons if flag_reasons else None,
            "weight_config_snapshot": {
                "weight_reply_rate": config["weight_reply_rate"],
                "weight_meeting_rate": config["weight_meeting_rate"],
                "weight_opp_rate": config["weight_opp_rate"],
            },
        })

    return pd.DataFrame(snapshots)


# ---------------------------------------------------------------------------
# 6. Write to Supabase
# ---------------------------------------------------------------------------

def write_touchpoints(sb: Client, touchpoints_df: pd.DataFrame) -> int:
    """Batch-insert step_touchpoints rows. Returns count written."""
    records = []
    for _, row in touchpoints_df.iterrows():
        records.append({
            "source": row["source"],
            "sequence_id": row["sequence_id"],
            "sequence_name": row["sequence_name"],
            "step_id": row["step_id"],
            "step_number": int(row["step_number"]),
            "step_type": row["step_type"],
            "contact_email": row["contact_email"],
            "contact_id": row.get("contact_id"),
            "opportunity_id": row.get("opportunity_id"),
            "sent_at": row.get("sent_at"),
            "opened": bool(row["opened"]),
            "clicked": bool(row["clicked"]),
            "replied": bool(row["replied"]),
            "meeting_booked": bool(row["meeting_booked"]),
            "attribution_type": row.get("attribution_type", "last_touch"),
            "pipeline_run_id": row["pipeline_run_id"],
        })

    # Batch in chunks of 500 to stay within Supabase payload limits.
    BATCH = 500
    written = 0
    for i in range(0, len(records), BATCH):
        chunk = records[i : i + BATCH]
        sb.table("step_touchpoints").insert(chunk).execute()
        written += len(chunk)
    return written


def write_snapshots(sb: Client, snapshots_df: pd.DataFrame) -> int:
    """Batch-insert step_performance rows. Returns count written."""
    records = snapshots_df.to_dict(orient="records")
    # Ensure JSON-serializable types
    for r in records:
        r["step_number"] = int(r["step_number"])
        r["flagged"] = bool(r["flagged"])

    BATCH = 500
    written = 0
    for i in range(0, len(records), BATCH):
        chunk = records[i : i + BATCH]
        sb.table("step_performance").insert(chunk).execute()
        written += len(chunk)
    return written


# ---------------------------------------------------------------------------
# 7. Pipeline run management
# ---------------------------------------------------------------------------

def start_run(sb: Client, run_id: str, source_files: list[str] | None) -> None:
    sb.table("pipeline_runs").insert({
        "id": run_id,
        "status": "running",
        "demo_mode": DEMO_MODE,
        "source_files": source_files,
    }).execute()


def complete_run(sb: Client, run_id: str, tp_count: int, snap_count: int) -> None:
    sb.table("pipeline_runs").update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat(),
        "touchpoints_written": tp_count,
        "snapshots_written": snap_count,
    }).eq("id", run_id).execute()


def fail_run(sb: Client, run_id: str, error: str) -> None:
    sb.table("pipeline_runs").update({
        "status": "failed",
        "completed_at": datetime.utcnow().isoformat(),
        "error_message": error[:2000],
    }).eq("id", run_id).execute()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"[attribution_model] Starting pipeline run: {run_id}")
    print(f"[attribution_model] DEMO_MODE={DEMO_MODE}")

    sb = get_supabase()

    # Source files list for audit
    source_files = None
    if DEMO_MODE:
        source_files = [
            "email_activity.json",
            "sequences.json",
            "sequence_steps.json",
            "sl_email_activity.json",
            "sl_cadences.json",
            "sl_steps.json",
            "sf_contacts.csv",
            "sf_opportunities.csv",
            "sf_opportunity_contact_roles.csv",
            "sf_tasks.csv",
        ]

    start_run(sb, run_id, source_files)

    try:
        # Step 1: Load config
        config = load_config(sb)
        print(f"[attribution_model] Config loaded: {config}")

        # Step 2: Load data
        if DEMO_MODE:
            print("[attribution_model] Loading from synthetic CSVs/JSON...")
            activity_df, sf_contacts_df, sf_opps_df, sf_ocr_df, meeting_cids = load_source_data()
        else:
            raise NotImplementedError("Live Supabase data loading not yet implemented")

        print(f"[attribution_model] Activity rows: {len(activity_df)}")
        print(f"[attribution_model] SF contacts: {len(sf_contacts_df)}, opps: {len(sf_opps_df)}, OCRs: {len(sf_ocr_df)}")

        # Step 3: Join chain
        print("[attribution_model] Running attribution join chain...")
        touchpoints_df = run_join_chain(
            activity_df, sf_contacts_df, sf_opps_df, sf_ocr_df, meeting_cids, run_id
        )
        print(f"[attribution_model] Touchpoints enriched: {len(touchpoints_df)}")

        # Steps 4 & 5: Metrics + health score + flagging
        print("[attribution_model] Calculating step performance...")
        snapshots_df = calculate_step_performance(touchpoints_df, config, run_id)
        print(f"[attribution_model] Snapshots calculated: {len(snapshots_df)}")

        flagged_count = int(snapshots_df["flagged"].sum())
        print(f"[attribution_model] Flagged steps: {flagged_count}")

        # Step 6: Write to Supabase
        print("[attribution_model] Writing touchpoints to Supabase...")
        tp_written = write_touchpoints(sb, touchpoints_df)
        print(f"[attribution_model] Touchpoints written: {tp_written}")

        print("[attribution_model] Writing snapshots to Supabase...")
        snap_written = write_snapshots(sb, snapshots_df)
        print(f"[attribution_model] Snapshots written: {snap_written}")

        # Step 7: Complete run
        complete_run(sb, run_id, tp_written, snap_written)
        print(f"[attribution_model] Pipeline run {run_id} completed successfully.")

    except Exception as e:
        print(f"[attribution_model] ERROR: {e}", file=sys.stderr)
        try:
            fail_run(sb, run_id, str(e))
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
