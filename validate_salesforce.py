"""
validate_salesforce.py
Validates the synthetic Salesforce data against the shared contact pool
and the Outreach / Salesloft output files.

Checks:
  1. Every sf_contacts email exists in Outreach email_activity.json
  2. Every sf_contacts email exists in Salesloft sl_email_activity.json
  3. Every ContactId in sf_opportunity_contact_roles.csv is in sf_contacts.csv
  4. Every OpportunityId in sf_opportunity_contact_roles.csv is in sf_opportunities.csv
  5. Stage distribution is within ±2% of targets
  6. No duplicate Id values within any single file
  7. Each opportunity has exactly one IsPrimary = True OCR record

Exit code 0 if all checks pass, 1 if any fail.
"""

import csv
import json
import sys
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data" / "synthetic"

STAGE_TARGETS = {
    "Prospecting":         35.0,
    "Qualification":       25.0,
    "Needs Analysis":      15.0,
    "Proposal/Price Quote": 10.0,
    "Negotiation":          5.0,
    "Closed Won":           6.0,
    "Closed Lost":          4.0,
}
TOLERANCE = 2.0  # ±2 percentage points


def read_csv(filename: str) -> list[dict]:
    path = DATA_DIR / filename
    if not path.exists():
        print(f"  ERROR: File not found: {path}")
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_or_emails() -> set[str]:
    """Emails from Outreach email_activity.json (_prospect_email field)."""
    path = DATA_DIR / "email_activity.json"
    if not path.exists():
        return set()
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {m["attributes"]["_prospect_email"] for m in data}


def load_sl_emails() -> set[str]:
    """Emails from Salesloft sl_email_activity.json (recipient.email field)."""
    path = DATA_DIR / "sl_email_activity.json"
    if not path.exists():
        return set()
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {a["recipient"]["email"] for a in data}


def check(label: str, passed: bool, detail: str = "") -> bool:
    status = "PASS" if passed else "FAIL"
    msg = f"  [{status}] {label}"
    if not passed and detail:
        msg += f"\n         {detail}"
    print(msg)
    return passed


def main() -> int:
    print("=" * 60)
    print("Salesforce Synthetic Data Validation")
    print("=" * 60)

    all_pass = True

    # Load files
    contacts      = read_csv("sf_contacts.csv")
    accounts      = read_csv("sf_accounts.csv")
    opportunities = read_csv("sf_opportunities.csv")
    ocrs          = read_csv("sf_opportunity_contact_roles.csv")
    tasks         = read_csv("sf_tasks.csv")

    or_emails = load_or_emails()
    sl_emails = load_sl_emails()

    sf_contact_emails  = {r["Email"] for r in contacts}
    sf_contact_ids     = {r["Id"] for r in contacts}
    sf_opp_ids         = {r["Id"] for r in opportunities}

    # ── Check 1: Every sf_contacts email in Outreach activity ────────────────
    missing_or = sf_contact_emails - or_emails
    ok = check(
        "Every sf_contacts email found in Outreach email_activity.json",
        len(missing_or) == 0,
        f"{len(missing_or)} missing: {sorted(missing_or)[:5]}{'...' if len(missing_or) > 5 else ''}",
    )
    all_pass = all_pass and ok

    # ── Check 2: Every sf_contacts email in Salesloft activity ───────────────
    missing_sl = sf_contact_emails - sl_emails
    ok = check(
        "Every sf_contacts email found in Salesloft sl_email_activity.json",
        len(missing_sl) == 0,
        f"{len(missing_sl)} missing: {sorted(missing_sl)[:5]}{'...' if len(missing_sl) > 5 else ''}",
    )
    all_pass = all_pass and ok

    # ── Check 3: OCR ContactIds are valid ─────────────────────────────────────
    bad_ocr_contacts = [
        r["ContactId"] for r in ocrs if r["ContactId"] not in sf_contact_ids
    ]
    ok = check(
        "All OCR ContactIds reference valid sf_contacts rows",
        len(bad_ocr_contacts) == 0,
        f"{len(bad_ocr_contacts)} invalid ContactIds: {bad_ocr_contacts[:5]}",
    )
    all_pass = all_pass and ok

    # ── Check 4: OCR OpportunityIds are valid ────────────────────────────────
    bad_ocr_opps = [
        r["OpportunityId"] for r in ocrs if r["OpportunityId"] not in sf_opp_ids
    ]
    ok = check(
        "All OCR OpportunityIds reference valid sf_opportunities rows",
        len(bad_ocr_opps) == 0,
        f"{len(bad_ocr_opps)} invalid OpportunityIds: {bad_ocr_opps[:5]}",
    )
    all_pass = all_pass and ok

    # ── Check 5: Stage distribution within ±2% ───────────────────────────────
    stage_counts = Counter(r["StageName"] for r in opportunities)
    total_opps   = len(opportunities)
    stage_errors = []
    for stage, target_pct in STAGE_TARGETS.items():
        actual = stage_counts.get(stage, 0)
        actual_pct = (actual / total_opps * 100) if total_opps else 0
        diff = abs(actual_pct - target_pct)
        if diff > TOLERANCE:
            stage_errors.append(
                f"{stage}: target={target_pct}%, actual={actual_pct:.1f}% (diff={diff:.1f}%)"
            )
    ok = check(
        "Stage distribution within ±2% of targets",
        len(stage_errors) == 0,
        "; ".join(stage_errors),
    )
    all_pass = all_pass and ok

    # ── Check 6: No duplicate Ids within any single file ─────────────────────
    dup_errors = []
    file_id_map = [
        ("sf_contacts.csv",                   contacts,      "Id"),
        ("sf_accounts.csv",                   accounts,      "Id"),
        ("sf_opportunities.csv",              opportunities, "Id"),
        ("sf_opportunity_contact_roles.csv",  ocrs,          "Id"),
        ("sf_tasks.csv",                      tasks,         "Id"),
    ]
    for fname, rows, id_field in file_id_map:
        ids = [r[id_field] for r in rows]
        dupes = [k for k, v in Counter(ids).items() if v > 1]
        if dupes:
            dup_errors.append(f"{fname}: {dupes[:3]}")
    ok = check(
        "No duplicate Id values within any single file",
        len(dup_errors) == 0,
        "; ".join(dup_errors),
    )
    all_pass = all_pass and ok

    # ── Check 7: Each opportunity has exactly one IsPrimary=True OCR ─────────
    primary_counts = Counter(
        r["OpportunityId"] for r in ocrs if r["IsPrimary"].strip().lower() == "true"
    )
    not_exactly_one = {
        opp_id: cnt
        for opp_id, cnt in primary_counts.items()
        if cnt != 1
    }
    # Also flag opps that have OCRs but zero primaries
    opps_with_ocrs = {r["OpportunityId"] for r in ocrs}
    zero_primary   = opps_with_ocrs - set(primary_counts.keys())
    primary_errors = []
    if not_exactly_one:
        primary_errors.append(f"wrong count: {dict(list(not_exactly_one.items())[:3])}")
    if zero_primary:
        primary_errors.append(f"no primary: {sorted(zero_primary)[:3]}")
    ok = check(
        "Each opportunity has exactly one IsPrimary=True OCR",
        len(primary_errors) == 0,
        "; ".join(primary_errors),
    )
    all_pass = all_pass and ok

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    if all_pass:
        print("Result: ALL CHECKS PASSED")
    else:
        print("Result: VALIDATION FAILED — see FAIL lines above")
    print("=" * 60)

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
