"""
generate_salesforce.py
Generates synthetic Salesforce CRM data referencing the shared contact pool.
Outputs 5 CSV files to data/synthetic/:
  sf_accounts.csv, sf_contacts.csv, sf_opportunities.csv,
  sf_opportunity_contact_roles.csv, sf_tasks.csv

LeadSource values are drawn from actual sequence/cadence names in the
Outreach and Salesloft output files. Attribution signal: contacts with
higher reply counts from sequencer output are preferentially assigned
to Qualification+ stage opportunities.
"""

import csv
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from data.shared.contact_pool import CONTACT_POOL  # noqa: E402

random.seed(42)

OUTPUT_DIR = _ROOT / "data" / "synthetic"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TODAY = date(2026, 3, 30)

# ── Stage configuration ───────────────────────────────────────────────────────

STAGE_SLOTS = [
    ("Prospecting",        28),
    ("Qualification",      20),
    ("Needs Analysis",     12),
    ("Proposal/Price Quote", 8),
    ("Negotiation",         4),
    ("Closed Won",          5),
    ("Closed Lost",         3),
]
OPEN_STAGES   = {"Prospecting", "Qualification", "Needs Analysis",
                 "Proposal/Price Quote", "Negotiation"}
CLOSED_STAGES = {"Closed Won", "Closed Lost"}

# Amount ranges by stage (min, max)
STAGE_AMOUNTS = {
    "Prospecting":         (15_000,  80_000),
    "Qualification":       (30_000, 120_000),
    "Needs Analysis":      (50_000, 150_000),
    "Proposal/Price Quote":(75_000, 200_000),
    "Negotiation":        (100_000, 250_000),
    "Closed Won":          (50_000, 250_000),
    "Closed Lost":         (15_000, 150_000),
}

OCR_ROLES = ["Decision Maker", "Economic Buyer", "Influencer", "End User"]

TASK_SUBJECTS = [
    "Discovery call",
    "Follow-up call",
    "Demo scheduled",
    "Sent pricing deck",
    "Proposal review",
    "Executive check-in",
    "Contract review",
    "Renewal discussion",
    "Technical deep dive",
    "Security assessment review",
    "ROI framework walkthrough",
    "Compliance checklist review",
    "Stakeholder alignment call",
    "Pilot kick-off",
    "Closed — filing record",
]

US_CITIES = [
    "San Francisco", "New York", "Austin", "Chicago", "Seattle",
    "Boston", "Denver", "Atlanta", "Dallas", "Los Angeles",
    "Washington DC", "Minneapolis", "Phoenix", "Charlotte", "Portland",
]

# ── Load sequencer names and compute reply counts ─────────────────────────────

def load_lead_sources():
    """Return a combined list of sequence/cadence names for LeadSource."""
    sources = []
    or_path = OUTPUT_DIR / "sequences.json"
    sl_path = OUTPUT_DIR / "sl_cadences.json"
    if or_path.exists():
        with open(or_path, encoding="utf-8") as f:
            for seq in json.load(f):
                sources.append(seq["attributes"]["name"])
    if sl_path.exists():
        with open(sl_path, encoding="utf-8") as f:
            for cad in json.load(f):
                sources.append(cad["name"])
    return sources if sources else ["Direct", "Web", "Partner Referral"]


def load_reply_counts():
    """Return {email: total_reply_count} across both sequencer outputs."""
    counts: Counter = Counter()
    or_path = OUTPUT_DIR / "email_activity.json"
    if or_path.exists():
        with open(or_path, encoding="utf-8") as f:
            for m in json.load(f):
                if m["attributes"].get("repliedAt"):
                    counts[m["attributes"]["_prospect_email"]] += 1
    sl_path = OUTPUT_DIR / "sl_email_activity.json"
    if sl_path.exists():
        with open(sl_path, encoding="utf-8") as f:
            for a in json.load(f):
                if a.get("replies", 0) > 0:
                    counts[a["recipient"]["email"]] += 1
    return counts


# ── Build master records ──────────────────────────────────────────────────────

def build_accounts():
    """One account per unique company in CONTACT_POOL."""
    seen, accounts = set(), []
    size_map = {
        "51-200":    (55,   190),
        "201-500":   (205,  490),
        "501-1000":  (505,  990),
        "1001-5000": (1050, 4800),
    }
    acc_id = 1
    for contact in CONTACT_POOL:
        co = contact["company"]
        if co in seen:
            continue
        seen.add(co)
        low, high = size_map[contact["company_size_band"]]
        accounts.append({
            "Id": f"sf_acc_{acc_id:03d}",
            "Name": co,
            "Industry": contact["industry"],
            "NumberOfEmployees": random.randint(low, high),
            "BillingCity": random.choice(US_CITIES),
        })
        acc_id += 1
    return accounts


def build_contacts(accounts):
    """One row per contact in CONTACT_POOL; AccountId links to sf_accounts."""
    company_to_acc = {a["Name"]: a["Id"] for a in accounts}
    contacts = []
    for i, c in enumerate(CONTACT_POOL):
        contacts.append({
            "Id": f"sf_con_{i + 1:03d}",
            "FirstName": c["first_name"],
            "LastName":  c["last_name"],
            "Email":     c["email"],
            "Title":     c["title"],
            "AccountId": company_to_acc[c["company"]],
            "Industry":  c["industry"],
        })
    return contacts


def build_opportunities(accounts, lead_sources):
    """80 opportunities distributed across accounts with stage-realistic data."""
    opps = []
    opp_id = 1
    acc_ids = [a["Id"] for a in accounts]

    stages_flat = []
    for stage, count in STAGE_SLOTS:
        stages_flat.extend([stage] * count)
    random.shuffle(stages_flat)

    for stage in stages_flat:
        lo, hi = STAGE_AMOUNTS[stage]
        amount = random.randrange(lo, hi + 1, 5_000)
        if stage in CLOSED_STAGES:
            days_back = random.randint(1, 180)
            close_dt = TODAY - timedelta(days=days_back)
        else:
            days_fwd = random.randint(7, 180)
            close_dt = TODAY + timedelta(days=days_fwd)

        acc_id = random.choice(acc_ids)
        source = random.choice(lead_sources)
        opps.append({
            "Id":          f"sf_opp_{opp_id:03d}",
            "Name":        f"Deal {opp_id:03d} — {stage}",
            "AccountId":   acc_id,
            "StageName":   stage,
            "Amount":      amount,
            "CloseDate":   close_dt.isoformat(),
            "LeadSource":  source,
        })
        opp_id += 1
    return opps


def build_ocrs(opportunities, contacts, reply_counts):
    """1-3 contact roles per opportunity; attribution-weighted for Qualification+."""
    # Contacts ordered by descending reply count (high engagement first)
    pool_emails = [c["email"] for c in CONTACT_POOL]
    sorted_by_reply = sorted(
        range(len(contacts)),
        key=lambda i: reply_counts.get(contacts[i]["Email"], 0),
        reverse=True,
    )
    # Split into high-reply bucket (top 30) and general bucket
    high_reply_idx = set(sorted_by_reply[:30])
    qualified_stages = {"Qualification", "Needs Analysis",
                        "Proposal/Price Quote", "Negotiation",
                        "Closed Won", "Closed Lost"}

    ocrs = []
    ocr_id = 1
    for opp in opportunities:
        n_roles = random.randint(1, 3)
        if opp["StageName"] in qualified_stages:
            # Preferentially draw at least one high-reply contact
            pool = (
                [i for i in sorted_by_reply[:30]] +
                list(range(len(contacts)))
            )
        else:
            pool = list(range(len(contacts)))

        chosen_idx = random.sample(range(len(contacts)), min(n_roles, len(contacts)))
        # For qualified stages, replace first pick with a high-reply contact if available
        if opp["StageName"] in qualified_stages and high_reply_idx:
            hr_candidate = random.choice(sorted_by_reply[:30])
            chosen_idx[0] = hr_candidate

        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for idx in chosen_idx:
            if idx not in seen:
                seen.add(idx)
                deduped.append(idx)

        roles = random.sample(OCR_ROLES, min(len(deduped), len(OCR_ROLES)))
        primary_set = False
        for j, contact_idx in enumerate(deduped):
            is_primary = not primary_set
            primary_set = True
            ocrs.append({
                "Id":            f"sf_ocr_{ocr_id:04d}",
                "OpportunityId": opp["Id"],
                "ContactId":     contacts[contact_idx]["Id"],
                "Role":          roles[j] if j < len(roles) else "Influencer",
                "IsPrimary":     str(is_primary),
            })
            ocr_id += 1
    return ocrs


def build_tasks(opportunities, contacts):
    """2-5 tasks per opportunity, each linked to a contact and opportunity."""
    contact_ids = [c["Id"] for c in contacts]
    tasks = []
    task_id = 1
    for opp in opportunities:
        n_tasks = random.randint(2, 5)
        for _ in range(n_tasks):
            days_back = random.randint(1, 180)
            activity_dt = TODAY - timedelta(days=days_back)
            task_type = random.choice(["Call", "Email"])
            subject = random.choice(TASK_SUBJECTS)
            tasks.append({
                "Id":           f"sf_tsk_{task_id:04d}",
                "WhoId":        random.choice(contact_ids),
                "WhatId":       opp["Id"],
                "Subject":      subject,
                "Status":       "Completed",
                "ActivityDate": activity_dt.isoformat(),
                "Type":         task_type,
            })
            task_id += 1
    return tasks


# ── CSV helpers ───────────────────────────────────────────────────────────────

def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"  Wrote {len(rows):>5} rows  -> {path.name}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Generating Salesforce synthetic data...")

    lead_sources  = load_lead_sources()
    reply_counts  = load_reply_counts()

    accounts     = build_accounts()
    contacts     = build_contacts(accounts)
    opportunities = build_opportunities(accounts, lead_sources)
    ocrs         = build_ocrs(opportunities, contacts, reply_counts)
    tasks        = build_tasks(opportunities, contacts)

    write_csv(OUTPUT_DIR / "sf_accounts.csv",   accounts,
              ["Id", "Name", "Industry", "NumberOfEmployees", "BillingCity"])

    write_csv(OUTPUT_DIR / "sf_contacts.csv",   contacts,
              ["Id", "FirstName", "LastName", "Email", "Title", "AccountId", "Industry"])

    write_csv(OUTPUT_DIR / "sf_opportunities.csv", opportunities,
              ["Id", "Name", "AccountId", "StageName", "Amount", "CloseDate", "LeadSource"])

    write_csv(OUTPUT_DIR / "sf_opportunity_contact_roles.csv", ocrs,
              ["Id", "OpportunityId", "ContactId", "Role", "IsPrimary"])

    write_csv(OUTPUT_DIR / "sf_tasks.csv",      tasks,
              ["Id", "WhoId", "WhatId", "Subject", "Status", "ActivityDate", "Type"])

    # Quick summary
    from collections import Counter
    stage_counts = Counter(o["StageName"] for o in opportunities)
    total = len(opportunities)
    print("\nStage distribution:")
    for stage, target_count in STAGE_SLOTS:
        actual = stage_counts[stage]
        pct = actual / total * 100
        print(f"  {stage:<25} {actual:>3} ({pct:.1f}%)")
    print(f"\nTotal OCRs: {len(ocrs)} | Tasks: {len(tasks)}")
    print(f"LeadSources sampled from {len(lead_sources)} sequences/cadences")
    print(f"Reply-count attribution: {sum(1 for v in reply_counts.values() if v > 0)} contacts with replies")
    print("\nDone.")


if __name__ == "__main__":
    main()
