"""
attribution_model.py
Beacon Loop attribution pipeline.

Reads sequencer email activity (Outreach + Salesloft) and Salesforce data,
executes a step-level attribution join chain, calculates per-step performance
metrics and health scores, and writes results to Supabase.
"""

import json
import csv
import math
import os
import sys
import uuid
from datetime import datetime, date, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from scipy import stats as sp_stats
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

# v1 health-score normalization ceilings (backward compatibility).
REPLY_CEILING = 0.06
MEETING_CEILING = 0.35
OPP_CEILING = 2.50

# v2 Bayesian priors: (alpha0, beta0)
BAYESIAN_PRIORS = {
    "reply": (2, 48),       # ~4% prior
    "meeting": (1, 99),     # ~1% prior
    "opp": (0.5, 99.5),     # ~0.5% prior
}

# v2 health-score normalization ceilings
V2_REPLY_CEILING = 0.08
V2_MEETING_CEILING = 0.04
V2_OPP_CEILING = 0.02

# Position decay factor per step
POSITION_DECAY = 0.65
DEFAULT_R1 = 0.06
R1_FLOOR = 0.05  # Minimum R1 to prevent threshold collapse in low-performing sequences


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


def load_intent_thresholds(sb: Client) -> dict[str, float | None]:
    """Load intent_type -> threshold_multiplier from intent_thresholds table."""
    resp = sb.table("intent_thresholds").select("intent_type, threshold_multiplier").execute()
    return {row["intent_type"]: row["threshold_multiplier"] for row in resp.data}


def load_messaging_themes(sb: Client) -> dict[str, str | None]:
    """Load step_id -> messaging_theme from sequence_steps."""
    resp = sb.table("sequence_steps").select("step_id, messaging_theme").execute()
    return {row["step_id"]: row.get("messaging_theme") for row in resp.data}


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
            "_rep_id": attr.get("_rep_id"),
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


def load_step_content() -> tuple[dict[str, dict], dict[tuple[str, str], int]]:
    """Load step subject/body from synthetic files for intent classification.

    Returns:
        step_content: dict mapping step_id (str) -> {subject, body_text}
        seq_max_steps: dict mapping (source, sequence_id) -> max_step_number
    """
    step_content: dict[str, dict] = {}
    seq_max: dict[tuple[str, str], int] = {}

    # Outreach
    for s in _load_json("sequence_steps.json"):
        attrs = s.get("attributes", {})
        rels = s.get("relationships", {})
        seq_id = str(rels.get("sequence", {}).get("data", {}).get("id", ""))
        step_id = str(s["id"])
        step_num = attrs.get("order", 0)
        step_content[step_id] = {
            "subject": attrs.get("subject"),
            "body_text": attrs.get("bodyText"),
        }
        key = ("outreach", seq_id)
        seq_max[key] = max(seq_max.get(key, 0), step_num)

    # Salesloft
    for s in _load_json("sl_steps.json"):
        ts = s.get("type_settings") or {}
        email_tpl = ts.get("email_template") or {}
        step_id = str(s["id"])
        cad_id = str(s["cadence_id"])
        step_num = s.get("step_number", 0)
        step_content[step_id] = {
            "subject": email_tpl.get("subject"),
            "body_text": email_tpl.get("body"),
        }
        key = ("salesloft", cad_id)
        seq_max[key] = max(seq_max.get(key, 0), step_num)

    return step_content, seq_max


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
# 3b. Scoring helpers
# ---------------------------------------------------------------------------

def classify_step_intent(
    step_number: int,
    max_step: int,
    step_type: str,
    subject: str | None,
    body_text: str | None,
) -> str:
    """Rule-based step intent classification.

    Priority: breakup > multi_channel > social_proof > follow_up > value_add > cold_opener
    """
    # Last step in sequence → breakup
    if step_number == max_step:
        return "breakup"

    # Call or LinkedIn → multi_channel
    if step_type in ("call", "phone", "linkedin", "other"):
        return "multi_channel"

    combined = ((subject or "") + " " + (body_text or "")).lower()

    # Email that references a multi-channel touchpoint (voicemail follow-up or LinkedIn message)
    if any(kw in combined for kw in ("linkedin", "voicemail")):
        return "multi_channel"

    # Social proof keywords
    if any(kw in combined for kw in ("case study", "customer", "results", "testimonial")):
        return "social_proof"

    # Follow-up keywords
    if any(kw in combined for kw in ("quick bump", "circling back", "following up", "just checking")):
        return "follow_up"

    # Value-add keywords
    if any(kw in combined for kw in ("insight", "data", "report", "research", "resource")):
        return "value_add"

    # Step 1 or anything unmatched
    return "cold_opener"


def bayesian_posterior_mean(successes: float, trials: int, alpha0: float, beta0: float) -> float:
    """Beta-Binomial posterior mean."""
    return (alpha0 + successes) / (alpha0 + beta0 + trials)


def beta_cdf_below(threshold: float, alpha: float, beta: float) -> float:
    """P(true_rate < threshold) using Beta distribution CDF."""
    if threshold <= 0:
        return 0.0
    if threshold >= 1:
        return 1.0
    return float(sp_stats.beta.cdf(threshold, alpha, beta))


def wilson_score_interval(successes: int, trials: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score confidence interval. Returns (lower, upper)."""
    if trials == 0:
        return (0.0, 0.0)
    p_hat = successes / trials
    denom = 1 + z ** 2 / trials
    center = (p_hat + z ** 2 / (2 * trials)) / denom
    margin = z * math.sqrt((p_hat * (1 - p_hat) + z ** 2 / (4 * trials)) / trials) / denom
    return (max(0.0, center - margin), min(1.0, center + margin))


# ---------------------------------------------------------------------------
# 4 & 5. Metric calculation, health score, flagging
# ---------------------------------------------------------------------------

def calculate_step_performance(
    touchpoints_df: pd.DataFrame,
    config: dict,
    pipeline_run_id: str,
    intent_thresholds: dict[str, float | None],
    step_content: dict[str, dict],
    seq_max_steps: dict[tuple[str, str], int],
    messaging_themes: dict[str, str | None] | None = None,
) -> pd.DataFrame:
    """Group touchpoints by step and calculate performance metrics.

    Computes v1 health_score + flagged (backward compat) and v2 Bayesian
    metrics: position-adjusted baselines, intent classification, Bayesian
    shrinkage, gated geometric mean health_score_v2, volume-tiered flagging.
    """

    group_cols = ["source", "sequence_id", "sequence_name", "step_id", "step_number", "step_type"]

    # --- Map string rep IDs (e.g. "sdr_3") to integer rep IDs for the reps table ---
    def _rep_id_to_int(raw: str | None) -> int | None:
        if not raw or not isinstance(raw, str):
            return None
        # Extract trailing digits: "sdr_3" → 3, "ae_1" → would be 7+ but only SDRs in email data
        parts = raw.split("_")
        if len(parts) == 2 and parts[1].isdigit():
            return int(parts[1])
        return None

    # --- Pre-compute R1 (step-1 reply rate) per sequence ---
    r1_by_seq: dict[tuple, float] = {}
    for keys, grp in touchpoints_df.groupby(group_cols, dropna=False):
        source, seq_id, _, _, step_num, _ = keys
        if int(step_num) == 1:
            sv = len(grp)
            rc = int(grp["replied"].sum())
            r1_by_seq[(source, seq_id)] = rc / sv if sv > 0 else DEFAULT_R1

    snapshots = []

    for keys, grp in touchpoints_df.groupby(group_cols, dropna=False):
        source, seq_id, seq_name, step_id, step_num, step_type = keys
        step_num = int(step_num)

        # ---- Rep assignment (pick one rep per step deterministically) ----
        rep_id_int = None
        if "_rep_id" in grp.columns:
            unique_reps = grp["_rep_id"].dropna().unique()
            if len(unique_reps) == 1:
                rep_id_int = _rep_id_to_int(unique_reps[0])
            elif len(unique_reps) > 1:
                # Multiple reps on same step — assign round-robin by step_number
                sorted_reps = sorted([_rep_id_to_int(r) for r in unique_reps if _rep_id_to_int(r) is not None])
                if sorted_reps:
                    rep_id_int = sorted_reps[(step_num - 1) % len(sorted_reps)]

        # ---- Basic counts (unchanged) ----
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

        # ---- v1 health score (backward compatibility) ----
        reply_norm_v1 = min(reply_rate / REPLY_CEILING, 1.0) if REPLY_CEILING > 0 else 0.0
        meeting_norm_v1 = min(meeting_rate / MEETING_CEILING, 1.0) if MEETING_CEILING > 0 else 0.0
        opp_norm_v1 = min(opp_created_rate / OPP_CEILING, 1.0) if OPP_CEILING > 0 else 0.0
        health_score_v1 = (
            reply_norm_v1 * config["weight_reply_rate"]
            + meeting_norm_v1 * config["weight_meeting_rate"]
            + opp_norm_v1 * config["weight_opp_rate"]
        )

        # v1 flagging
        flag_reasons = []
        if reply_rate < config["threshold_reply_rate"]:
            flag_reasons.append(
                f"Reply rate {reply_rate:.1%} below threshold {config['threshold_reply_rate']:.1%}"
            )
        if meeting_rate < config["threshold_meeting_rate"]:
            flag_reasons.append(
                f"Meeting rate {meeting_rate:.1%} below threshold {config['threshold_meeting_rate']:.1%}"
            )
        if health_score_v1 < config["threshold_health_score"]:
            flag_reasons.append(
                f"Health score {health_score_v1:.3f} below threshold {config['threshold_health_score']:.3f}"
            )
        flagged_v1 = len(flag_reasons) > 0

        # ---- 3a: Position-adjusted baseline ----
        r1_observed = r1_by_seq.get((source, seq_id), DEFAULT_R1)
        r1 = max(r1_observed, R1_FLOOR)
        position_expected_rate = r1 * (POSITION_DECAY ** (step_num - 1))

        # ---- 3b: Step intent classification ----
        meta = step_content.get(str(step_id), {})
        max_step = seq_max_steps.get((source, str(seq_id)), step_num)
        step_intent = classify_step_intent(
            step_num, max_step, step_type,
            meta.get("subject"), meta.get("body_text"),
        )
        itm = intent_thresholds.get(step_intent)

        # ---- 3c: Bayesian shrinkage ----
        a_r, b_r = BAYESIAN_PRIORS["reply"]
        a_m, b_m = BAYESIAN_PRIORS["meeting"]
        a_o, b_o = BAYESIAN_PRIORS["opp"]
        bay_reply = bayesian_posterior_mean(rc, sv, a_r, b_r)
        bay_meeting = bayesian_posterior_mean(mc, sv, a_m, b_m)
        bay_opp = bayesian_posterior_mean(occ, sv, a_o, b_o)

        # ---- 3d: Gated geometric mean health score ----
        reply_norm_v2 = min(bay_reply / V2_REPLY_CEILING, 1.0)
        meeting_norm_v2 = min(bay_meeting / V2_MEETING_CEILING, 1.0)
        opp_norm_v2 = min(bay_opp / V2_OPP_CEILING, 1.0)
        health_score_v2 = (
            (reply_norm_v2 + 0.01) ** 0.50
            * (meeting_norm_v2 + 0.01) ** 0.30
            * (opp_norm_v2 + 0.01) ** 0.20
        )
        health_gate = bay_reply < 0.01 or bay_meeting < 0.003

        # ---- 3e: Volume-tiered flagging (unified Bayesian) ----
        if sv < 50:
            vol_tier = "low"
        elif sv <= 200:
            vol_tier = "medium"
        else:
            vol_tier = "high"

        flag_type = "none"
        flag_confidence = None
        ci_upper = None
        ci_lower = None

        if itm is not None:  # skip multi_channel (NULL multiplier)
            adjusted_threshold = position_expected_rate * itm

            # Bayesian posterior for reply rate
            alpha_post = a_r + rc
            beta_post = b_r + sv - rc

            # Unified: Bayesian P(true_rate < threshold) for ALL tiers
            p_below = beta_cdf_below(adjusted_threshold, alpha_post, beta_post)
            flag_confidence = round(p_below, 4)

            if health_gate or p_below > 0.80:
                flag_type = "bayesian_flag"

            # Wilson CIs — informational, computed for all tiers
            lower, upper = wilson_score_interval(rc, sv)
            ci_lower = round(lower, 6)
            ci_upper = round(upper, 6)

        # Pre-generate UUID so attribution_credit can reference it
        snapshot_id = str(uuid.uuid4())

        snapshots.append({
            "id": snapshot_id,
            "pipeline_run_id": pipeline_run_id,
            "snapshot_date": str(date.today()),
            "source": source,
            "sequence_id": str(seq_id),
            "sequence_name": seq_name,
            "step_id": str(step_id),
            "step_number": step_num,
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
            # v1 backward compat
            "health_score": round(health_score_v1, 4),
            "flagged": flagged_v1,
            "flag_reasons": flag_reasons if flag_reasons else None,
            "weight_config_snapshot": {
                "weight_reply_rate": config["weight_reply_rate"],
                "weight_meeting_rate": config["weight_meeting_rate"],
                "weight_opp_rate": config["weight_opp_rate"],
            },
            # v2 new columns
            "position_expected_rate": round(position_expected_rate, 6),
            "step_intent": step_intent,
            "intent_threshold_multiplier": itm,
            "bayesian_reply_rate": round(bay_reply, 6),
            "bayesian_meeting_rate": round(bay_meeting, 6),
            "bayesian_opp_rate": round(bay_opp, 6),
            "health_score_v2": round(health_score_v2, 6),
            "health_gate_override": health_gate,
            "send_volume_tier": vol_tier,
            "flag_type": flag_type,
            "flag_confidence": flag_confidence,
            "credible_interval_upper": ci_upper,
            "credible_interval_lower": ci_lower,
            "messaging_theme": (messaging_themes or {}).get(str(step_id)),
            "rep_id": rep_id_int,
        })

    return pd.DataFrame(snapshots)


# ---------------------------------------------------------------------------
# 5b. U-shaped + last-touch attribution credit
# ---------------------------------------------------------------------------

def compute_attribution_credit(
    touchpoints_df: pd.DataFrame,
    snapshots_df: pd.DataFrame,
) -> pd.DataFrame:
    """Compute U-shaped and last-touch attribution credit per step-opportunity pair.

    U-shaped: 40% first step, 40% last engaged step, 20% split among middle engaged.
    Last-touch: 100% to last engaged step.

    Groups by (opportunity_id, source, sequence_id) so step_numbers are meaningful.
    """

    # Lookup: (source, sequence_id, step_id) -> step_performance UUID
    snap_id_lookup: dict[tuple, str] = {}
    for _, row in snapshots_df.iterrows():
        snap_id_lookup[(row["source"], row["sequence_id"], row["step_id"])] = row["id"]

    opp_tp = touchpoints_df[touchpoints_df["opportunity_id"].notna()].copy()
    credits: list[dict] = []

    for (opp_id, source, seq_id), grp in opp_tp.groupby(
        ["opportunity_id", "source", "sequence_id"], dropna=False
    ):
        opp_amount = float(grp["opp_amount"].iloc[0]) if "opp_amount" in grp.columns else None
        entries = []
        for _, tp in grp.iterrows():
            snap_uuid = snap_id_lookup.get((tp["source"], tp["sequence_id"], tp["step_id"]))
            if not snap_uuid:
                continue
            eng = 0
            if tp["replied"]:
                eng = 3
            elif tp["clicked"]:
                eng = 2
            elif tp["opened"]:
                eng = 1
            entries.append({
                "snap_uuid": snap_uuid,
                "step_number": int(tp["step_number"]),
                "engagement": eng,
            })

        if not entries:
            continue

        # Deduplicate: per snap_uuid, keep max engagement
        best: dict[str, dict] = {}
        for e in entries:
            uid = e["snap_uuid"]
            if uid not in best or e["engagement"] > best[uid]["engagement"]:
                best[uid] = e
        entries = sorted(best.values(), key=lambda x: x["step_number"])

        engaged = [e for e in entries if e["engagement"] > 0]

        # --- Last-touch: 100% to last engaged step (or last step if none) ---
        lt_step = engaged[-1] if engaged else entries[-1]
        credits.append({
            "step_id": lt_step["snap_uuid"],
            "opportunity_id": str(opp_id),
            "model_type": "last_touch",
            "credit_fraction": 1.0,
            "opportunity_amount": opp_amount,
        })

        # --- U-shaped ---
        first_step = entries[0]  # lowest step_number

        if not engaged:
            credits.append({
                "step_id": first_step["snap_uuid"],
                "opportunity_id": str(opp_id),
                "model_type": "u_shaped",
                "credit_fraction": 1.0,
                "opportunity_amount": opp_amount,
            })
            continue

        last_engaged = max(engaged, key=lambda x: (x["step_number"], x["engagement"]))
        first_uuid = first_step["snap_uuid"]
        last_uuid = last_engaged["snap_uuid"]

        if first_uuid == last_uuid:
            credits.append({
                "step_id": first_uuid,
                "opportunity_id": str(opp_id),
                "model_type": "u_shaped",
                "credit_fraction": 1.0,
                "opportunity_amount": opp_amount,
            })
        else:
            credit_map: dict[str, float] = {}
            credit_map[first_uuid] = credit_map.get(first_uuid, 0) + 0.40
            credit_map[last_uuid] = credit_map.get(last_uuid, 0) + 0.40

            middle = [
                e for e in engaged
                if e["snap_uuid"] != first_uuid and e["snap_uuid"] != last_uuid
            ]
            if middle:
                per_middle = 0.20 / len(middle)
                for m in middle:
                    credit_map[m["snap_uuid"]] = credit_map.get(m["snap_uuid"], 0) + per_middle
            else:
                credit_map[first_uuid] += 0.10
                credit_map[last_uuid] += 0.10

            for snap_uuid, frac in credit_map.items():
                credits.append({
                    "step_id": snap_uuid,
                    "opportunity_id": str(opp_id),
                    "model_type": "u_shaped",
                    "credit_fraction": round(frac, 4),
                    "opportunity_amount": opp_amount,
                })

    if not credits:
        return pd.DataFrame(columns=["step_id", "opportunity_id", "model_type", "credit_fraction", "opportunity_amount"])
    return pd.DataFrame(credits)


# ---------------------------------------------------------------------------
# 6. Write to Supabase
# ---------------------------------------------------------------------------

def write_touchpoints(sb: Client, touchpoints_df: pd.DataFrame) -> int:
    """Batch-insert step_touchpoints rows. Returns count written."""
    touchpoints_df = touchpoints_df.astype(object).where(touchpoints_df.notna(), other=None)
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
    for r in records:
        r["step_number"] = int(r["step_number"])
        r["flagged"] = bool(r["flagged"])
        # Ensure boolean/None types for new columns
        if r.get("health_gate_override") is not None:
            r["health_gate_override"] = bool(r["health_gate_override"])
        # Convert numpy/pandas NaN to None for JSON serialization
        for col, val in r.items():
            if val is not None and isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                r[col] = None

    BATCH = 500
    written = 0
    for i in range(0, len(records), BATCH):
        chunk = records[i : i + BATCH]
        sb.table("step_performance").insert(chunk).execute()
        written += len(chunk)
    return written


def write_attribution_credit(sb: Client, credit_df: pd.DataFrame) -> int:
    """Batch-insert step_attribution_credit rows. Returns count written."""
    if credit_df.empty:
        return 0
    records = credit_df.to_dict(orient="records")

    BATCH = 500
    written = 0
    for i in range(0, len(records), BATCH):
        chunk = records[i : i + BATCH]
        sb.table("step_attribution_credit").insert(chunk).execute()
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
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "touchpoints_written": tp_count,
        "snapshots_written": snap_count,
    }).eq("id", run_id).execute()


def fail_run(sb: Client, run_id: str, error: str) -> None:
    sb.table("pipeline_runs").update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
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
        # Step 1: Load config + intent thresholds
        config = load_config(sb)
        print(f"[attribution_model] Config loaded: {config}")

        intent_thresholds = load_intent_thresholds(sb)
        print(f"[attribution_model] Intent thresholds loaded: {len(intent_thresholds)} types")

        messaging_themes = load_messaging_themes(sb)
        themed = sum(1 for v in messaging_themes.values() if v is not None)
        print(f"[attribution_model] Messaging themes loaded: {themed}/{len(messaging_themes)} steps classified")

        # Step 2: Load data
        if DEMO_MODE:
            print("[attribution_model] Loading from synthetic CSVs/JSON...")
            activity_df, sf_contacts_df, sf_opps_df, sf_ocr_df, meeting_cids = load_source_data()
            step_content, seq_max_steps = load_step_content()
        else:
            raise NotImplementedError("Live Supabase data loading not yet implemented")

        print(f"[attribution_model] Activity rows: {len(activity_df)}")
        print(f"[attribution_model] SF contacts: {len(sf_contacts_df)}, opps: {len(sf_opps_df)}, OCRs: {len(sf_ocr_df)}")
        print(f"[attribution_model] Step content loaded for {len(step_content)} steps across {len(seq_max_steps)} sequences")

        # Step 3: Join chain
        print("[attribution_model] Running attribution join chain...")
        touchpoints_df = run_join_chain(
            activity_df, sf_contacts_df, sf_opps_df, sf_ocr_df, meeting_cids, run_id
        )
        print(f"[attribution_model] Touchpoints enriched: {len(touchpoints_df)}")

        # Steps 4 & 5: Metrics + health score + flagging
        print("[attribution_model] Calculating step performance (v2 Bayesian)...")
        snapshots_df = calculate_step_performance(
            touchpoints_df, config, run_id,
            intent_thresholds, step_content, seq_max_steps,
            messaging_themes,
        )
        print(f"[attribution_model] Snapshots calculated: {len(snapshots_df)}")

        flagged_count = int(snapshots_df["flagged"].sum())
        v2_flagged = int((snapshots_df["flag_type"] != "none").sum())
        print(f"[attribution_model] v1 flagged steps: {flagged_count}")
        print(f"[attribution_model] v2 flagged steps: {v2_flagged}")

        # Step 6: Write to Supabase
        print("[attribution_model] Writing touchpoints to Supabase...")
        tp_written = write_touchpoints(sb, touchpoints_df)
        print(f"[attribution_model] Touchpoints written: {tp_written}")

        print("[attribution_model] Writing snapshots to Supabase...")
        snap_written = write_snapshots(sb, snapshots_df)
        print(f"[attribution_model] Snapshots written: {snap_written}")

        # Step 7: Attribution credit
        print("[attribution_model] Computing attribution credit (U-shaped + last-touch)...")
        credit_df = compute_attribution_credit(touchpoints_df, snapshots_df)
        print(f"[attribution_model] Attribution credit rows: {len(credit_df)}")

        credit_written = write_attribution_credit(sb, credit_df)
        print(f"[attribution_model] Attribution credit written: {credit_written}")

        # Step 8: Complete run
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
