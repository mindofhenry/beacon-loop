"""
outreach_generator.py
Generates synthetic Outreach data matching the public OpenAPI schema.
Outputs: sequences.json, sequence_steps.json, email_activity.json
All saved to data/synthetic/

PRD benchmarks:
  - Open rate: 27% avg (range 15-45%)
  - Reply rate: 2.9% avg (range 0.5-8%)
  - Deliberate underperformer: ~1.1% reply rate on step 3 of sequence 2 (seq_id 1002)
  - Top performer rep (rep_id 3): 2-3x above team avg on reply and click rates
"""

import json
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from faker import Faker

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from data.shared.contact_pool import CONTACT_POOL  # noqa: E402

fake = Faker()
random.seed(42)       # controls IDs, rep assignment, attrition, timestamps — keep deterministic
Faker.seed(42)        # controls names/companies — keep deterministic
rng = random.Random() # unseeded — controls per-step engagement rates so they vary across runs

OUTPUT_DIR = Path(__file__).parent.parent.parent / "data" / "synthetic"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

NUM_SEQUENCES = 13
STEPS_PER_SEQUENCE_RANGE = (5, 7)
PROSPECTS_PER_STEP = len(CONTACT_POOL)  # 100 — one slot per pool contact

# Stable prospect records derived from the shared contact pool
POOL_PROSPECTS = [
    {
        "id": 10001 + i,
        "first_name": c["first_name"],
        "last_name":  c["last_name"],
        "email":      c["email"],
        "title":      c["title"],
        "company":    c["company"],
    }
    for i, c in enumerate(CONTACT_POOL)
]

REPS = [
    {"id": 1, "name": "Marcus Webb",    "email": "marcus.webb@doomsday-inc.com"},
    {"id": 2, "name": "Priya Nair",     "email": "priya.nair@doomsday-inc.com"},
    {"id": 3, "name": "Jordan Chase",   "email": "jordan.chase@doomsday-inc.com"},  # top performer
    {"id": 4, "name": "Samantha Reyes", "email": "samantha.reyes@doomsday-inc.com"},
    {"id": 5, "name": "Tyler Brooks",   "email": "tyler.brooks@doomsday-inc.com"},
]
TOP_PERFORMER_REP_ID = 3

SEQUENCE_CONFIGS = [
    # ── Existing 5 (IDs 1001–1005) — do not modify ────────────────────────────────────────
    {"name": "CISO Outbound — Q2 Pipeline Push",       "tags": ["ciso", "enterprise", "q2"],              "description": "Targeting CISOs at 500-5000 employee companies with a security posture angle.",                "tier": "green"},
    {"name": "VP Eng — Developer Security Cold",        "tags": ["vp-eng", "developer-security", "cold"],  "description": "Cold outreach to VP Engineering at Series B-D SaaS on developer security pain.",                "tier": "yellow"},
    {"name": "IT Director — Compliance Renewal",        "tags": ["it-director", "compliance", "renewal"],  "description": "Re-engagement sequence for IT Directors approaching compliance renewal windows.",               "tier": "yellow"},
    {"name": "CTO Sequence — Post-Funding Outreach",    "tags": ["cto", "post-funding", "enterprise"],     "description": "Targeting CTOs at companies that closed a Series B or C in the last 90 days.",                 "tier": "green"},
    {"name": "Security Engineer — Inbound Follow-Up",   "tags": ["security-engineer", "inbound"],          "description": "Follow-up sequence for inbound leads from security engineering personas.",                     "tier": "red"},
    # ── New 8 (IDs 1006–1013) ─────────────────────────────────────────────────────────────
    {"name": "VP Sales — Q3 Revenue Push",
     "tags": ["vp-sales", "revenue", "q3"],
     "description": "High-volume outbound to VP Sales at mid-market companies. Q3 pipeline acceleration angle with data-driven value-add.",
     "tier": "green",
     "num_steps": 5,
     "prospect_count": 400,   # HIGH VOLUME: 100 POOL + 300 synthetic
     "value_add_step": 3},
    {"name": "VP Marketing — Pipeline Attribution",
     "tags": ["vp-marketing", "attribution", "pipeline"],
     "description": "Outbound targeting VP Marketing on pipeline attribution and marketing ROI measurement.",
     "tier": "green",
     "num_steps": 6,
     "value_add_step": 3},
    {"name": "CFO — Security ROI Framework",
     "tags": ["cfo", "security-roi", "finance"],
     "description": "Finance-angle outreach to CFOs quantifying security investment returns and risk reduction.",
     "tier": "yellow",
     "num_steps": 5,
     "social_proof_step": 3},
    {"name": "IT Director — Cloud Security Posture",
     "tags": ["it-director", "cloud-security", "posture"],
     "description": "Cold outreach to IT Directors managing cloud security posture and tool consolidation.",
     "tier": "yellow",
     "num_steps": 5},
    {"name": "VP Sales — Stalled Deal Re-Engage",
     "tags": ["vp-sales", "re-engage", "pipeline"],
     "description": "7-step re-engagement sequence for VP Sales contacts at stalled opportunities.",
     "tier": "yellow",
     "num_steps": 7,
     "prospect_count": 400},  # HIGH VOLUME: 100 POOL + 300 synthetic
    {"name": "CFO — Budget Freeze Outbound",
     "tags": ["cfo", "budget", "cost-reduction"],
     "description": "CFO-targeted outreach during budget cycles. High reply signal, zero meeting conversion (tests health gate).",
     "tier": "yellow",   # yellow rates → decent replies; synthetic-only pool → zero meetings → pipeline forces red
     "num_steps": 5,
     "prospect_count": 350,
     "synthetic_only": True},
    {"name": "VP Marketing — Brand Risk Outbound",
     "tags": ["vp-marketing", "brand-risk", "compliance"],
     "description": "Brand safety and compliance risk angle for VP Marketing at SaaS and media companies.",
     "tier": "yellow",
     "num_steps": 4},
    {"name": "CISO — Board Risk Reporting",
     "tags": ["ciso", "board-reporting", "risk"],
     "description": "High-volume CISO sequence focused on board-level risk reporting and executive communication.",
     "tier": "green",
     "num_steps": 6,
     "prospect_count": 400,   # HIGH VOLUME: 100 POOL + 300 synthetic
     "social_proof_step": 3},
]

TOPICS      = ["security", "compliance", "identity", "cloud infrastructure", "developer tooling"]
PERSONAS    = ["CISO", "VP of Engineering", "IT Director", "CTO", "Security Engineer"]
PAIN_POINTS = ["alert fatigue", "compliance gaps", "shadow IT exposure", "slow incident response", "developer security debt"]
TRIGGERS    = ["expanded your engineering team", "announced a new product", "closed a funding round", "posted a compliance job", "moved to the cloud"]
SIMILAR_COS = ["Stripe", "Notion", "Linear", "Vercel", "Retool", "Figma"]
ASSET_TYPES = ["benchmark report", "case study", "risk calculator", "ROI framework"]

EMAIL_TEMPLATES = [
    {"subject": "Quick question on your {topic} stack",
     "body": "Hi {{first_name}},\n\nNoticed {company_name} recently {trigger}. Most {persona}s I talk to are dealing with {pain_point} — is that on your radar?\n\nWorth a 15-minute call?\n\n{rep_name}"},
    {"subject": "Re: {topic} at {company_name}",
     "body": "Hi {{first_name}},\n\nFollowing up on my last note. We helped {similar_company} reduce {pain_point} meaningfully in under 90 days.\n\nDoes that resonate?\n\n{rep_name}"},
    {"subject": "One thing I missed in my last email",
     "body": "Hi {{first_name}},\n\nForgot to mention — we have a {asset_type} on {topic} specifically for {persona}s at companies your size. No pitch, just benchmarks.\n\nWant me to send it over?\n\n{rep_name}"},
    {"subject": "Should I close your file, {{first_name}}?",
     "body": "Hi {{first_name}},\n\nI've reached out a few times without a response. Should I close your file, or is there a better time to reconnect?\n\n{rep_name}"},
    {"subject": "Last note — {topic} for {company_name}",
     "body": "Hi {{first_name}},\n\nThis is my last note. If {pain_point} ever becomes a priority, my calendar is at calendly.com/beacon-demo.\n\n{rep_name}"},
]

CALL_TEMPLATES = [
    {"body": "Call attempt — introduce value prop and ask for 15 minutes."},
    {"body": "Call attempt — reference last email open, ask about {pain_point}."},
    {"body": "Call attempt — breakup call, confirm fit or close file."},
]

# Intent-specific templates — used for sequences that need reliable intent classification
VALUE_ADD_TEMPLATE = {
    "subject": "Q3 {topic} data — worth 5 minutes?",
    "body": "Hi {{first_name}},\n\nJust published our {topic} research report — data from 200+ companies on {pain_point}. The insights for {persona}s at companies your size are specific and actionable.\n\nWant me to send the report over?\n\n{rep_name}",
}
SOCIAL_PROOF_TEMPLATE = {
    "subject": "How {similar_company} tackled {pain_point}",
    "body": "Hi {{first_name}},\n\nA customer similar to {company_name} — same stage, same {pain_point} challenge — reduced their exposure by 60% in 90 days. Happy to share the case study and customer results.\n\n15 minutes this week?\n\n{rep_name}",
}
MULTICHANNEL_EMAIL_TEMPLATE = {
    "subject": "Also sent you a LinkedIn message, {{first_name}}",
    "body": "Hi {{first_name}},\n\nI left you a voicemail earlier and sent a LinkedIn connection request too — wanted to make sure this didn't fall through the cracks.\n\n{pain_point} keeps coming up with {persona}s right now. Is it on your radar?\n\n{rep_name}",
}

_EXTRA_FIRST_NAMES = ["Alex", "Jordan", "Morgan", "Taylor", "Casey", "Riley", "Jamie",
                       "Quinn", "Avery", "Blake", "Drew", "Emery", "Finley", "Harley",
                       "Kendall", "Logan", "Parker", "Reese", "Sage", "Skyler"]
_EXTRA_LAST_NAMES  = ["Chen", "Kim", "Patel", "Nguyen", "Rodriguez", "Williams", "Johnson",
                       "Smith", "Brown", "Davis", "Wilson", "Anderson", "Thomas", "Jackson",
                       "Martinez", "Garcia", "Lee", "Harris", "Clark", "Lewis"]
_EXTRA_COMPANIES   = ["Apex Corp", "Summit Group", "Vertex Inc", "Pinnacle Solutions",
                       "Meridian Tech", "Horizon Systems", "Zenith Group", "Atlas Corp",
                       "Crestview Inc", "Northgate Solutions", "Ridgemont Group", "Oakfield Corp",
                       "Starfield Inc", "Ironwood Group", "BlueSky Systems", "RedRock Corp"]
_EXTRA_TITLES      = ["VP of Sales", "VP of Marketing", "CFO", "CIO", "Director of Revenue",
                       "Head of Finance", "VP of Revenue Operations", "Chief Financial Officer",
                       "VP of Growth", "Director of Marketing", "VP of Finance"]


def generate_extra_prospects(start_id: int, count: int, tag: str) -> list:
    """Synthetic prospects not in CONTACT_POOL — no Salesforce match, no attributed meetings."""
    local_rng = random.Random(start_id)
    return [
        {
            "id": start_id + i,
            "first_name": local_rng.choice(_EXTRA_FIRST_NAMES),
            "last_name":  local_rng.choice(_EXTRA_LAST_NAMES),
            "email":      f"{local_rng.choice(_EXTRA_FIRST_NAMES).lower()}.{local_rng.choice(_EXTRA_LAST_NAMES).lower()}.{tag}.{i:04d}@synth.mock",
            "title":      local_rng.choice(_EXTRA_TITLES),
            "company":    local_rng.choice(_EXTRA_COMPANIES),
        }
        for i in range(count)
    ]


def iso_dt(dt):
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

def random_past_dt(days_back_max=180, days_back_min=1):
    delta = random.randint(days_back_min * 86400, days_back_max * 86400)
    return datetime.now(timezone.utc) - timedelta(seconds=delta)

def render(template, rep_name):
    return template.format(
        topic=random.choice(TOPICS),
        company_name=fake.company(),
        trigger=random.choice(TRIGGERS),
        persona=random.choice(PERSONAS),
        pain_point=random.choice(PAIN_POINTS),
        similar_company=random.choice(SIMILAR_COS),
        asset_type=random.choice(ASSET_TYPES),
        rep_name=rep_name,
    )

def get_step_rates(step_order, is_underperformer, is_top_performer_step, tier="yellow"):
    if is_underperformer:
        # Hard floor ~1.1% per-send regardless of tier
        return {"open_rate": round(rng.uniform(0.28, 0.38), 4),
                "click_rate": round(rng.uniform(0.005, 0.015), 4),
                "reply_rate": round(rng.uniform(0.020, 0.038), 4)}
    decay = max(0.6, 1.0 - (step_order - 1) * 0.06)
    open_r  = rng.uniform(0.20, 0.42) * decay
    click_r = rng.uniform(0.010, 0.035) * decay
    # Tier-specific reply rates (% of opens):
    #   green:  15–22% of opens × ~31% avg open ≈ 5–7% per-send
    #   yellow: 8–11.5% of opens × ~31% avg open ≈ 2.5–3.5% per-send
    #   red:    3–6% of opens × ~31% avg open ≈ 0.9–1.9% per-send
    if tier == "green":
        reply_r = rng.uniform(0.15, 0.22) * decay
    elif tier == "red":
        reply_r = rng.uniform(0.030, 0.060) * decay
    else:  # yellow (default)
        reply_r = rng.uniform(0.10, 0.14) * decay
    if is_top_performer_step:
        mult = rng.uniform(2.0, 2.5)
        reply_r = min(reply_r * mult, 0.35)
        click_r = min(click_r * 1.5, 0.08)
        open_r  = min(open_r * 1.2, 0.60)
    return {"open_rate": round(open_r, 4), "click_rate": round(click_r, 4), "reply_rate": round(reply_r, 4)}

def mailing_state(opened, clicked, replied, bounced):
    if bounced: return "bounced"
    if replied: return "replied"
    if clicked or opened: return "opened"
    return "delivered"


def generate_sequences():
    seqs = []
    for i, cfg in enumerate(SEQUENCE_CONFIGS):
        seq_id = 1001 + i
        created = random_past_dt(365, 60)
        updated = created + timedelta(days=random.randint(1, 30))
        # Existing configs: random step count (preserves random state).
        # New configs: fixed num_steps to avoid consuming global random state for them.
        num_steps = cfg.get("num_steps") or random.randint(*STEPS_PER_SEQUENCE_RANGE)
        seqs.append({
            "id": seq_id, "type": "sequence",
            "_tier": cfg["tier"],
            "_prospect_count":  cfg.get("prospect_count", len(POOL_PROSPECTS)),
            "_synthetic_only":  cfg.get("synthetic_only", False),
            "_value_add_step":  cfg.get("value_add_step"),
            "_social_proof_step": cfg.get("social_proof_step"),
            "_multichannel_step": cfg.get("multichannel_step"),
            "attributes": {
                "name": cfg["name"], "description": cfg["description"],
                "enabled": True,
                "enabledAt": iso_dt(created + timedelta(days=1)),
                "sequenceType": "interval",
                "scheduleIntervalType": "schedule",
                "shareType": "shared",
                "tags": cfg["tags"],
                "sequenceStepCount": num_steps,
                "durationInDays": num_steps * 3,
                "automationPercentage": round(random.uniform(0.6, 1.0), 2),
                "deliverCount": None, "openCount": None, "clickCount": None,
                "replyCount": None, "bounceCount": None, "optOutCount": None,
                "scheduleCount": 0,
                "primaryReplyAction": "finish",
                "secondaryReplyAction": "continue",
                "stepOverridesEnabled": False,
                "createdAt": iso_dt(created), "updatedAt": iso_dt(updated),
            },
        })
    return seqs


def generate_steps(sequences):
    steps, step_id = [], 5000
    for seq in sequences:
        seq_id = seq["id"]
        tier   = seq.get("_tier", "yellow")
        num_steps = seq["attributes"]["sequenceStepCount"]
        created_base = datetime.fromisoformat(seq["attributes"]["createdAt"].replace("Z", "+00:00"))
        for order in range(1, num_steps + 1):
            step_id += 1
            # Force intent-override steps to email so templates are applied.
            _intent_step = (seq.get("_value_add_step") == order or
                            seq.get("_social_proof_step") == order or
                            seq.get("_multichannel_step") == order)
            if order == 1 or order == num_steps or _intent_step:
                stype = "auto_email"
            else:
                stype = random.choices(["auto_email", "manual_email", "call"], weights=[0.50, 0.20, 0.30])[0]
            # Guarantee top performer (rep_id 3) owns step 1 of sequences 1001 and 1004
            # so the ★ TOP PERFORMER flag reliably fires on high-volume steps
            if order == 1 and seq_id in (1001, 1004):
                rep = next(r for r in REPS if r["id"] == TOP_PERFORMER_REP_ID)
            else:
                rep = random.choice(REPS)
            is_email = stype in ("auto_email", "manual_email")
            if is_email:
                # Route to intent-specific template if this sequence has an override for this step.
                va_step = seq.get("_value_add_step")
                sp_step = seq.get("_social_proof_step")
                mc_step = seq.get("_multichannel_step")
                if va_step and order == va_step:
                    tmpl = VALUE_ADD_TEMPLATE
                elif sp_step and order == sp_step:
                    tmpl = SOCIAL_PROOF_TEMPLATE
                elif mc_step and order == mc_step:
                    tmpl = MULTICHANNEL_EMAIL_TEMPLATE
                else:
                    tmpl = EMAIL_TEMPLATES[min(order - 1, len(EMAIL_TEMPLATES) - 1)]
                subject = render(tmpl["subject"], rep["name"])
                body    = render(tmpl["body"], rep["name"])
            else:
                tmpl = CALL_TEMPLATES[min(order - 1, len(CALL_TEMPLATES) - 1)]
                subject, body = None, render(tmpl["body"], rep["name"])
            step_created = created_base + timedelta(days=order)
            dc = random.randint(80, 200) if is_email else None
            oc = int(dc * random.uniform(0.15, 0.40)) if is_email else None
            rc = int(dc * random.uniform(0.008, 0.07)) if is_email else None
            cc = int(dc * random.uniform(0.005, 0.03)) if is_email else None
            steps.append({
                "id": step_id, "type": "sequenceStep",
                "attributes": {
                    "order": order,
                    "displayName": f"Step {order} — {stype.replace('_', ' ').title()}",
                    "stepType": stype,
                    "interval": order * 3 * 86400,
                    "date": None, "taskAutoskipDelay": None,
                    "deliverCount": dc, "openCount": oc, "clickCount": cc,
                    "replyCount": rc,
                    "bounceCount": int(dc * 0.02) if is_email else None,
                    "negativeReplyCount": int(rc * 0.10) if rc else None,
                    "neutralReplyCount":  int(rc * 0.60) if rc else None,
                    "positiveReplyCount": int(rc * 0.30) if rc else None,
                    "optOutCount": int(dc * 0.005) if is_email else None,
                    "failureCount": 0, "scheduleCount": 0,
                    "subject": subject,
                    "bodyHtml": f"<p>{body}</p>" if body else None,
                    "bodyText": body,
                    "createdAt": iso_dt(step_created),
                    "updatedAt": iso_dt(step_created + timedelta(days=1)),
                    "_rep_id": rep["id"], "_rep_name": rep["name"],
                    "_tier": tier,
                },
                "relationships": {"sequence": {"data": {"id": seq_id, "type": "sequence"}}},
            })
    return steps


def generate_mailings(sequences, steps):
    mailings, mailing_id = [], 200000
    steps_by_seq = defaultdict(list)
    for s in steps:
        steps_by_seq[s["relationships"]["sequence"]["data"]["id"]].append(s)
    for sid in steps_by_seq:
        steps_by_seq[sid].sort(key=lambda x: x["attributes"]["order"])

    seq_agg = {seq["id"]: {"deliver": 0, "open": 0, "click": 0, "reply": 0, "bounce": 0} for seq in sequences}

    for seq in sequences:
        seq_id = seq["id"]
        prospect_count = seq.get("_prospect_count", len(POOL_PROSPECTS))
        synthetic_only = seq.get("_synthetic_only", False)
        tag = f"or{seq_id}"
        # ID range per sequence: 50000 + offset ensures no collision with POOL_PROSPECTS (10001-10100)
        extra_start_id = 50000 + (seq_id - 1001) * 500
        if synthetic_only:
            prospects = generate_extra_prospects(extra_start_id, prospect_count, tag)
        elif prospect_count > len(POOL_PROSPECTS):
            extra = generate_extra_prospects(extra_start_id, prospect_count - len(POOL_PROSPECTS), tag)
            prospects = list(POOL_PROSPECTS) + extra
        else:
            prospects = list(POOL_PROSPECTS)
        seq_created = datetime.fromisoformat(seq["attributes"]["createdAt"].replace("Z", "+00:00"))

        for step in steps_by_seq.get(seq_id, []):
            stype = step["attributes"]["stepType"]
            if stype not in ("auto_email", "manual_email"):
                continue

            step_id = step["id"]
            order   = step["attributes"]["order"]
            rep_id  = step["attributes"]["_rep_id"]
            tier    = step["attributes"].get("_tier", "yellow")
            is_under = (seq_id == 1002 and order == 3)
            # Restrict boost to early (high-volume) steps: applying it to all rep_id=3
            # steps makes ~35% of sends top-performer sends, which forces the overall
            # reply rate above 3.5% even when per-step rates are modest.
            # Limiting to order ≤ 2 drops that share to ~21%, leaving room for
            # individual steps to hit >8% while keeping the aggregate in 2.5–3.5%.
            is_top   = (rep_id == TOP_PERFORMER_REP_ID and order <= 2)
            rates    = get_step_rates(order, is_under, is_top, tier=tier)

            attrition = max(0.40, 1.0 - (order - 1) * 0.12)
            active    = random.sample(prospects, int(len(prospects) * attrition))
            n         = len(active)

            # Deterministic outcome counts — no coin-flip variance
            n_bounce  = max(1, round(n * 0.018))
            n_deliver = n - n_bounce
            n_open    = round(n_deliver * rates["open_rate"])
            n_click   = round(n_open * rates["click_rate"])
            n_reply   = round(n_open * rates["reply_rate"])
            # clicks and replies can overlap — cap at opens
            n_click   = min(n_click, n_open)
            n_reply   = min(n_reply, n_open)

            # Assign outcomes to prospect slots
            # clicked and replied must be drawn from opened (so opened_at is set)
            shuffled = active[:]
            random.shuffle(shuffled)
            bounced_set = set(p["id"] for p in shuffled[:n_bounce])
            delivered   = shuffled[n_bounce:]
            random.shuffle(delivered)
            opened      = delivered[:n_open]
            opened_set  = set(p["id"] for p in opened)
            pool = opened[:]
            random.shuffle(pool)
            clicked_set = set(p["id"] for p in pool[:n_click])
            random.shuffle(pool)
            replied_set = set(p["id"] for p in pool[:n_reply])

            for p in active:
                mailing_id += 1
                pid     = p["id"]
                bounced = pid in bounced_set
                opened  = pid in opened_set
                clicked = pid in clicked_set
                replied = pid in replied_set
                state   = mailing_state(opened, clicked, replied, bounced)

                offset       = timedelta(days=(order - 1) * 3 + random.randint(0, 2), hours=random.randint(7, 17), minutes=random.randint(0, 59))
                scheduled_at = seq_created + offset
                delivered_at = scheduled_at + timedelta(minutes=random.randint(1, 5)) if not bounced else None
                opened_at    = delivered_at + timedelta(hours=random.randint(1, 48))   if opened and delivered_at else None
                clicked_at   = opened_at   + timedelta(minutes=random.randint(2, 120)) if clicked and opened_at else None
                replied_at   = opened_at   + timedelta(hours=random.randint(1, 24))    if replied and opened_at else None
                bounced_at   = scheduled_at + timedelta(minutes=random.randint(5, 60)) if bounced else None
                last_event   = replied_at or clicked_at or opened_at or bounced_at or delivered_at or scheduled_at

                seq_agg[seq_id]["deliver"] += 1 if delivered_at else 0
                seq_agg[seq_id]["open"]    += 1 if opened else 0
                seq_agg[seq_id]["click"]   += 1 if clicked else 0
                seq_agg[seq_id]["reply"]   += 1 if replied else 0
                seq_agg[seq_id]["bounce"]  += 1 if bounced else 0

                mailings.append({
                    "id": mailing_id, "type": "mailing",
                    "attributes": {
                        "subject":   step["attributes"]["subject"],
                        "bodyHtml":  step["attributes"]["bodyHtml"],
                        "bodyText":  step["attributes"]["bodyText"],
                        "state":     state,
                        "trackOpens": True, "trackLinks": True,
                        "openCount":  1 if opened else 0,
                        "clickCount": 1 if clicked else 0,
                        "scheduledAt":    iso_dt(scheduled_at),
                        "deliveredAt":    iso_dt(delivered_at) if delivered_at else None,
                        "openedAt":       iso_dt(opened_at)    if opened_at    else None,
                        "clickedAt":      iso_dt(clicked_at)   if clicked_at   else None,
                        "repliedAt":      iso_dt(replied_at)   if replied_at   else None,
                        "bouncedAt":      iso_dt(bounced_at)   if bounced_at   else None,
                        "stateChangedAt": iso_dt(last_event),
                        "createdAt":      iso_dt(scheduled_at),
                        "updatedAt":      iso_dt(last_event),
                        "errorReason": None, "errorBacktrace": None,
                        "retryCount": 0, "retryAt": None, "retryInterval": None,
                        "followUpTaskType": "follow_up" if not replied and not bounced else None,
                        "followUpTaskScheduledAt": None,
                        "overrideSafetySettings": False,
                        "references": [], "unsubscribedAt": None,
                        "_prospect_id":         p["id"],
                        "_prospect_email":      p["email"],
                        "_prospect_first_name": p["first_name"],
                        "_prospect_last_name":  p["last_name"],
                        "_prospect_title":      p["title"],
                        "_prospect_company":    p["company"],
                        "_rep_id": rep_id,
                    },
                    "relationships": {
                        "sequenceStep": {"data": {"id": step_id, "type": "sequenceStep"}},
                        "sequence":     {"data": {"id": seq_id,  "type": "sequence"}},
                        "prospect":     {"data": {"id": p["id"], "type": "prospect"}},
                    },
                })

    for seq in sequences:
        agg = seq_agg[seq["id"]]
        seq["attributes"].update({"deliverCount": agg["deliver"], "openCount": agg["open"],
                                   "clickCount": agg["click"],   "replyCount": agg["reply"],
                                   "bounceCount": agg["bounce"]})
    return mailings


def print_summary(sequences, steps, mailings):
    print(f"\n=== Validation Summary ===")
    print(f"Sequences: {len(sequences)} | Steps: {len(steps)} | Mailings: {len(mailings)}")
    email_steps = [s for s in steps if s["attributes"]["stepType"] in ("auto_email", "manual_email")]
    call_steps  = [s for s in steps if s["attributes"]["stepType"] == "call"]
    print(f"Email steps: {len(email_steps)} | Call steps: {len(call_steps)}\n")

    stats = defaultdict(lambda: {"sends": 0, "opens": 0, "replies": 0, "rep_id": None})
    for m in mailings:
        sid = m["relationships"]["sequenceStep"]["data"]["id"]
        stats[sid]["sends"]   += 1
        stats[sid]["opens"]   += 1 if m["attributes"]["openedAt"] else 0
        stats[sid]["replies"] += 1 if m["attributes"]["repliedAt"] else 0
        stats[sid]["rep_id"]   = m["attributes"]["_rep_id"]

    step_map = {s["id"]: s for s in steps}
    print(f"{'StepID':>8} {'SeqID':>6} {'Ord':>4} {'Type':>12} {'Sends':>6} {'OpenR':>7} {'RepR':>7} {'RepID':>6}")
    print("-" * 72)
    for step in sorted(email_steps, key=lambda s: (s["relationships"]["sequence"]["data"]["id"], s["attributes"]["order"])):
        sid    = step["id"]
        seq_id = step["relationships"]["sequence"]["data"]["id"]
        order  = step["attributes"]["order"]
        stype  = step["attributes"]["stepType"]
        st     = stats[sid]
        sends  = st["sends"]
        open_r = st["opens"]   / sends if sends else 0
        rep_r  = st["replies"] / sends if sends else 0
        rep_id = st["rep_id"]
        flag   = " ⚠ UNDERPERFORMER" if rep_r < 0.02 else (" ★ TOP PERFORMER" if rep_id == TOP_PERFORMER_REP_ID and rep_r > 0.05 else "")
        print(f"{sid:>8} {seq_id:>6} {order:>4} {stype:>12} {sends:>6} {open_r:>6.1%} {rep_r:>6.1%} {rep_id:>6}{flag}")

    total_sends   = sum(s["sends"]   for s in stats.values())
    total_opens   = sum(s["opens"]   for s in stats.values())
    total_replies = sum(s["replies"] for s in stats.values())
    print(f"\nOverall open rate:  {total_opens/total_sends:.1%}  (PRD target ~27%)")
    print(f"Overall reply rate: {total_replies/total_sends:.1%}  (PRD target ~2.9%)")

    # Per-sequence reply rate summary for tier verification
    seq_stats = defaultdict(lambda: {"sends": 0, "replies": 0, "name": "", "tier": ""})
    for m in mailings:
        sid = m["relationships"]["sequence"]["data"]["id"]
        seq_stats[sid]["sends"]   += 1
        seq_stats[sid]["replies"] += 1 if m["attributes"]["repliedAt"] else 0
    for seq in sequences:
        seq_stats[seq["id"]]["name"] = seq["attributes"]["name"]
        seq_stats[seq["id"]]["tier"] = seq.get("_tier", "?")
    print(f"\n{'SeqID':>6} {'Tier':>6} {'Sends':>6} {'RepR':>7}  Name")
    print("-" * 70)
    for sid in sorted(seq_stats):
        ss = seq_stats[sid]
        rep_r = ss["replies"] / ss["sends"] if ss["sends"] else 0
        print(f"{sid:>6} {ss['tier']:>6} {ss['sends']:>6} {rep_r:>6.1%}  {ss['name']}")


def main():
    print("Generating Outreach synthetic data...")
    sequences = generate_sequences()
    steps     = generate_steps(sequences)
    mailings  = generate_mailings(sequences, steps)

    for fname, data in [("sequences.json", sequences), ("sequence_steps.json", steps), ("email_activity.json", mailings)]:
        path = OUTPUT_DIR / fname
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  Wrote {len(data):>5} records → {path}")

    print_summary(sequences, steps, mailings)
    print("\nDone.")

if __name__ == "__main__":
    main()
