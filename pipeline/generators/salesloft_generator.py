"""
salesloft_generator.py
Generates synthetic Salesloft data matching the public REST API schema.
Outputs: sl_cadences.json, sl_steps.json, sl_email_activity.json
All saved to data/synthetic/

PRD benchmarks:
  - Open rate: 27% avg (range 15-45%)
  - Reply rate: 4% avg (range 1-10%)
  - Deliberate underperformer: ~1.1% reply rate on step 3 of cadence 2 (cad_id 2002)
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

NUM_CADENCES = 12
STEPS_PER_CADENCE_RANGE = (5, 7)
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

CADENCE_CONFIGS = [
    # ── Existing 5 (IDs 2001–2005) — do not modify ────────────────────────────────────────
    {"name": "ENT-CISO-Q2 Outbound",         "cadence_function": "outbound", "tags": ["ciso", "enterprise", "q2"],    "tier": "green"},
    {"name": "VP Eng — DevSec Cold",          "cadence_function": "outbound", "tags": ["vp-eng", "devsec", "cold"],    "tier": "yellow"},
    {"name": "IT Director — Compliance Push", "cadence_function": "outbound", "tags": ["it-director", "compliance"],   "tier": "red"},
    {"name": "CTO — Post-Funding",            "cadence_function": "outbound", "tags": ["cto", "post-funding"],         "tier": "green"},
    {"name": "Security Eng — Inbound FU",     "cadence_function": "inbound",  "tags": ["security-eng", "inbound"],     "tier": "yellow"},
    # ── New 7 (IDs 2006–2012) ─────────────────────────────────────────────────────────────
    {"name": "IT Director — Zero Trust Rollout",
     "cadence_function": "outbound", "tags": ["it-director", "zero-trust", "cloud"],
     "description": "Outbound to IT Directors leading zero-trust initiatives with value-add research content.",
     "tier": "green",
     "num_steps": 5,
     "value_add_step": 3},
    {"name": "VP Sales — Enterprise Pipeline Push",
     "cadence_function": "outbound", "tags": ["vp-sales", "enterprise", "pipeline"],
     "description": "High-volume outbound to VP Sales at enterprise accounts. Research-backed value-add approach.",
     "tier": "yellow",
     "num_steps": 6,
     "prospect_count": 400,   # HIGH VOLUME: 100 POOL + 300 synthetic
     "value_add_step": 3},
    {"name": "CFO — Compliance Automation ROI",
     "cadence_function": "outbound", "tags": ["cfo", "compliance", "roi"],
     "description": "Red-tier CFO sequence. Breakup step deliberately underperforms the 2.0x intent multiplier.",
     "tier": "red",
     "num_steps": 5,
     "prospect_count": 300},  # needs sv~156 at step 5 so rc=0 produces p_below > 0.80
    {"name": "VP Marketing — Demand Gen Audit",
     "cadence_function": "outbound", "tags": ["vp-marketing", "demand-gen", "audit"],
     "description": "Short sequence for VP Marketing focused on demand gen pipeline efficiency.",
     "tier": "yellow",
     "num_steps": 4},
    {"name": "IT Director — Security Stack Consolidation",
     "cadence_function": "outbound", "tags": ["it-director", "consolidation", "multi-channel"],
     "description": "Multi-channel 7-step sequence. Step 3 email references LinkedIn + voicemail touchpoints.",
     "tier": "yellow",
     "num_steps": 7,
     "multichannel_step": 3},
    {"name": "CISO — Cyber Insurance Readiness",
     "cadence_function": "outbound", "tags": ["ciso", "cyber-insurance", "risk"],
     "description": "CISO sequence for cyber insurance readiness. Social proof step with customer results.",
     "tier": "green",
     "num_steps": 5,
     "social_proof_step": 3},
    {"name": "VP Sales — Competitive Win-Back",
     "cadence_function": "outbound", "tags": ["vp-sales", "competitive", "win-back"],
     "description": "High-volume VP Sales win-back. Decent reply rates, zero meeting conversion (tests health gate).",
     "tier": "yellow",   # yellow rates → decent replies; synthetic-only pool → zero meetings → pipeline forces red
     "num_steps": 6,
     "prospect_count": 350,
     "synthetic_only": True},
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


# Intent-specific templates — identical to Outreach equivalents for consistent classification
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

def get_step_rates(step_number, is_underperformer, is_top_performer_step, tier="yellow"):
    if is_underperformer:
        # Hard floor ~1.1% per-send regardless of tier
        return {"open_rate": round(rng.uniform(0.28, 0.38), 4),
                "click_rate": round(rng.uniform(0.005, 0.015), 4),
                "reply_rate": round(rng.uniform(0.020, 0.038), 4)}
    decay = max(0.6, 1.0 - (step_number - 1) * 0.06)
    open_r  = rng.uniform(0.20, 0.42) * decay
    click_r = rng.uniform(0.010, 0.035) * decay
    # Tier-specific reply rates (% of opens):
    #   green:  15–22% of opens × ~31% avg open ≈ 5–7% per-send
    #   yellow: 11–16% of opens × ~31% avg open ≈ 3.4–5% per-send
    #   red:    3–6% of opens × ~31% avg open ≈ 0.9–1.9% per-send
    if tier == "green":
        reply_r = rng.uniform(0.15, 0.22) * decay
    elif tier == "red":
        reply_r = rng.uniform(0.030, 0.060) * decay
    else:  # yellow (default)
        reply_r = rng.uniform(0.110, 0.160) * decay
    if is_top_performer_step:
        mult = rng.uniform(2.0, 2.5)
        reply_r = min(reply_r * mult, 0.50)
        click_r = min(click_r * 1.5, 0.08)
        open_r  = min(open_r * 1.2, 0.60)
    return {"open_rate": round(open_r, 4), "click_rate": round(click_r, 4), "reply_rate": round(reply_r, 4)}


def generate_cadences():
    cadences = []
    for i, cfg in enumerate(CADENCE_CONFIGS):
        cad_id = 2001 + i
        created = random_past_dt(365, 60)
        updated = created + timedelta(days=random.randint(1, 30))
        # Existing configs: random step count (preserves random state).
        # New configs: fixed num_steps to avoid consuming global random state for them.
        num_steps = cfg.get("num_steps") or random.randint(*STEPS_PER_CADENCE_RANGE)
        owner = random.choice(REPS)
        cadences.append({
            "id": cad_id,
            "_tier": cfg["tier"],
            "_prospect_count":    cfg.get("prospect_count", len(POOL_PROSPECTS)),
            "_synthetic_only":    cfg.get("synthetic_only", False),
            "_value_add_step":    cfg.get("value_add_step"),
            "_social_proof_step": cfg.get("social_proof_step"),
            "_multichannel_step": cfg.get("multichannel_step"),
            "name": cfg["name"],
            "cadence_function": cfg["cadence_function"],
            "current_state": "active",
            "shared": True,
            "team_cadence": False,
            "owner_id": owner["id"],
            "target_daily_people": random.randint(15, 40),
            "remove_replied": True,
            "remove_bounced": True,
            "created_at": iso_dt(created),
            "updated_at": iso_dt(updated),
            "_num_steps": num_steps,  # internal — stripped before write
            "counts": {
                "people_added": 0,
                "emails_sent": 0,
                "calls_logged": 0,
                "replies": 0,
                "bounces": 0,
                "optouts": 0,
                "meetings_booked": 0,
            },
        })
    return cadences


def generate_steps(cadences):
    steps, step_id = [], 6000
    for cad in cadences:
        cad_id = cad["id"]
        tier   = cad.get("_tier", "yellow")
        num_steps = cad["_num_steps"]
        created_base = datetime.fromisoformat(cad["created_at"].replace("Z", "+00:00"))
        for order in range(1, num_steps + 1):
            step_id += 1
            # Force intent-override steps to Email so templates are applied.
            _intent_step = (cad.get("_value_add_step") == order or
                            cad.get("_social_proof_step") == order or
                            cad.get("_multichannel_step") == order)
            if order == 1 or order == num_steps or _intent_step:
                stype = "Email"
            elif cad_id == 2002 and order == 3:
                stype = "Email"  # must be Email — deliberate underperformer step
            elif cad_id == 2010 and order == 3:
                stype = "Email"  # must be Email — multi-channel reference step (voicemail/LinkedIn)
            else:
                stype = random.choices(["Email", "Phone"], weights=[0.70, 0.30])[0]
            # Guarantee top performer (rep_id 3) owns step 1 of cadences 2001 and 2004
            # so the ★ TOP PERFORMER flag reliably fires on high-volume steps
            if order == 1 and cad_id in (2001, 2004):
                rep = next(r for r in REPS if r["id"] == TOP_PERFORMER_REP_ID)
            else:
                rep = random.choice(REPS)
            is_email = (stype == "Email")
            type_settings = None
            if is_email:
                # Route to intent-specific template if this cadence has an override for this step.
                va_step = cad.get("_value_add_step")
                sp_step = cad.get("_social_proof_step")
                mc_step = cad.get("_multichannel_step")
                if va_step and order == va_step:
                    tmpl = VALUE_ADD_TEMPLATE
                elif sp_step and order == sp_step:
                    tmpl = SOCIAL_PROOF_TEMPLATE
                elif mc_step and order == mc_step:
                    tmpl = MULTICHANNEL_EMAIL_TEMPLATE
                else:
                    tmpl = EMAIL_TEMPLATES[min(order - 1, len(EMAIL_TEMPLATES) - 1)]
                subject = render(tmpl["subject"], rep["name"])
                body    = render(tmpl["body"],    rep["name"])
                type_settings = {"email_template": {"subject": subject, "body": body}}
            step_created = created_base + timedelta(days=order)
            steps.append({
                "id": step_id,
                "cadence_id": cad_id,
                "name": f"Step {order} — {stype}",
                "type": stype,
                "day": order * 3,
                "step_number": order,
                "enabled": True,
                "created_at": iso_dt(step_created),
                "updated_at": iso_dt(step_created + timedelta(days=1)),
                "type_settings": type_settings,
                "_rep_id": rep["id"],
                "_rep_name": rep["name"],
                "_tier": tier,
            })
    return steps


def generate_email_activity(cadences, steps):
    activities = []
    act_id = 400000
    steps_by_cadence = defaultdict(list)
    for s in steps:
        steps_by_cadence[s["cadence_id"]].append(s)
    for cad_id in steps_by_cadence:
        steps_by_cadence[cad_id].sort(key=lambda x: x["step_number"])

    for cad in cadences:
        cad_id = cad["id"]
        prospect_count = cad.get("_prospect_count", len(POOL_PROSPECTS))
        synthetic_only = cad.get("_synthetic_only", False)
        tag = f"sl{cad_id}"
        extra_start_id = 60000 + (cad_id - 2001) * 500
        if synthetic_only:
            prospects = generate_extra_prospects(extra_start_id, prospect_count, tag)
        elif prospect_count > len(POOL_PROSPECTS):
            extra = generate_extra_prospects(extra_start_id, prospect_count - len(POOL_PROSPECTS), tag)
            prospects = list(POOL_PROSPECTS) + extra
        else:
            prospects = list(POOL_PROSPECTS)
        cad_created = datetime.fromisoformat(cad["created_at"].replace("Z", "+00:00"))

        agg = {"emails_sent": 0, "calls_logged": 0, "replies": 0, "bounces": 0}

        for step in steps_by_cadence.get(cad_id, []):
            step_num     = step["step_number"]
            attrition    = max(0.40, 1.0 - (step_num - 1) * 0.12)
            active_count = int(len(prospects) * attrition)

            if step["type"] != "Email":
                agg["calls_logged"] += active_count
                continue

            step_id  = step["id"]
            rep_id   = step["_rep_id"]
            tier     = step.get("_tier", "yellow")
            # 2002 step 3: existing deliberate underperformer
            # 2008 step 5: breakup step underperformer (tests 2× intent multiplier)
            is_under = (cad_id == 2002 and step_num == 3) or (cad_id == 2008 and step_num == 5)
            # Restrict boost to early (high-volume) steps only — same constraint as
            # outreach_generator to avoid distorting aggregate averages above target.
            is_top   = (rep_id == TOP_PERFORMER_REP_ID and step_num <= 2)
            rates    = get_step_rates(step_num, is_under, is_top, tier=tier)

            active = random.sample(prospects, active_count)
            n      = len(active)

            # Deterministic outcome counts — no coin-flip variance
            n_bounce  = max(1, round(n * 0.018))
            n_deliver = n - n_bounce
            n_open    = round(n_deliver * rates["open_rate"])
            n_click   = round(n_open * rates["click_rate"])
            n_reply   = round(n_open * rates["reply_rate"])
            # clicks and replies can overlap — cap at opens
            n_click   = min(n_click, n_open)
            n_reply   = min(n_reply, n_open)
            # Breakup underperformer: force 0 replies so P(rate < 2× threshold) > 0.80
            # With sv~156 and rc=0, posterior mean ~0.97% << threshold 1.79%.
            if cad_id == 2008 and step_num == 5:
                n_reply = 0

            # Assign outcomes to prospect slots
            # clicked and replied must be drawn from opened (so opens > 0)
            shuffled = active[:]
            random.shuffle(shuffled)
            bounced_set = set(p["id"] for p in shuffled[:n_bounce])
            delivered   = shuffled[n_bounce:]
            random.shuffle(delivered)
            opened_list = delivered[:n_open]
            opened_set  = set(p["id"] for p in opened_list)
            pool = opened_list[:]
            random.shuffle(pool)
            clicked_set = set(p["id"] for p in pool[:n_click])
            random.shuffle(pool)
            replied_set = set(p["id"] for p in pool[:n_reply])

            for p in active:
                act_id += 1
                pid          = p["id"]
                bounced      = pid in bounced_set
                opened_flag  = pid in opened_set
                clicked_flag = pid in clicked_set
                replied_flag = pid in replied_set

                status = "bounced" if bounced else "sent"

                offset = timedelta(
                    days=(step_num - 1) * 3 + random.randint(0, 2),
                    hours=random.randint(7, 17),
                    minutes=random.randint(0, 59),
                )
                created_ts = cad_created + offset

                last_ts = created_ts
                if bounced:
                    last_ts = created_ts + timedelta(minutes=random.randint(5, 60))
                elif replied_flag:
                    last_ts = created_ts + timedelta(hours=random.randint(2, 72))
                elif clicked_flag:
                    last_ts = created_ts + timedelta(hours=random.randint(2, 50))
                elif opened_flag:
                    last_ts = created_ts + timedelta(hours=random.randint(1, 48))

                agg["emails_sent"] += 1
                if replied_flag:
                    agg["replies"] += 1
                if bounced:
                    agg["bounces"] += 1

                activities.append({
                    "id": act_id,
                    "subject": step["type_settings"]["email_template"]["subject"],
                    "status": status,
                    "bounced": bounced,
                    "opens": 1 if opened_flag else 0,
                    "clicks": 1 if clicked_flag else 0,
                    "replies": 1 if replied_flag else 0,
                    "created_at": iso_dt(created_ts),
                    "updated_at": iso_dt(last_ts),
                    "recipient": {"id": p["id"], "email": p["email"]},
                    "cadence":   {"id": cad_id},
                    "step":      {"id": step_id},
                    "user":      {"id": rep_id},
                    "_person_id":         p["id"],
                    "_person_email":      p["email"],
                    "_person_first_name": p["first_name"],
                    "_person_last_name":  p["last_name"],
                    "_person_title":      p["title"],
                    "_person_company":    p["company"],
                    "_rep_id":            rep_id,
                })

        # Roll cadence-level aggregates up from activity records
        cad["counts"]["people_added"]    = len(prospects)
        cad["counts"]["emails_sent"]     = agg["emails_sent"]
        cad["counts"]["calls_logged"]    = agg["calls_logged"]
        cad["counts"]["replies"]         = agg["replies"]
        cad["counts"]["bounces"]         = agg["bounces"]
        cad["counts"]["optouts"]         = max(0, round(agg["emails_sent"] * 0.005))
        cad["counts"]["meetings_booked"] = max(0, round(agg["replies"] * 0.10))

    return activities


def print_summary(cadences, steps, activities):
    print(f"\n=== Salesloft Validation Summary ===")
    email_steps = [s for s in steps if s["type"] == "Email"]
    phone_steps = [s for s in steps if s["type"] == "Phone"]
    print(f"Cadences: {len(cadences)} | Steps: {len(steps)} | Email activities: {len(activities)}")
    print(f"Email steps: {len(email_steps)} | Phone steps: {len(phone_steps)}\n")

    stats = defaultdict(lambda: {"sends": 0, "opens": 0, "replies": 0, "rep_id": None})
    for act in activities:
        sid = act["step"]["id"]
        stats[sid]["sends"]   += 1
        stats[sid]["opens"]   += act["opens"]
        stats[sid]["replies"] += act["replies"]
        stats[sid]["rep_id"]   = act["_rep_id"]

    print(f"{'StepID':>8} {'CadID':>6} {'Ord':>4} {'Type':>8} {'Sends':>6} {'OpenR':>7} {'RepR':>7} {'RepID':>6}")
    print("-" * 72)
    for step in sorted(email_steps, key=lambda s: (s["cadence_id"], s["step_number"])):
        sid    = step["id"]
        cad_id = step["cadence_id"]
        order  = step["step_number"]
        stype  = step["type"]
        st     = stats[sid]
        sends  = st["sends"]
        open_r = st["opens"]   / sends if sends else 0
        rep_r  = st["replies"] / sends if sends else 0
        rep_id = st["rep_id"]
        flag   = " ⚠ UNDERPERFORMER" if rep_r < 0.02 else (" ★ TOP PERFORMER" if rep_id == TOP_PERFORMER_REP_ID and rep_r > 0.05 else "")
        print(f"{sid:>8} {cad_id:>6} {order:>4} {stype:>8} {sends:>6} {open_r:>6.1%} {rep_r:>6.1%} {rep_id:>6}{flag}")

    total_sends   = sum(s["sends"]   for s in stats.values())
    total_opens   = sum(s["opens"]   for s in stats.values())
    total_replies = sum(s["replies"] for s in stats.values())
    print(f"\nOverall open rate:  {total_opens/total_sends:.1%}  (PRD target ~27%)")
    print(f"Overall reply rate: {total_replies/total_sends:.1%}  (PRD target ~4%)")

    # Per-cadence reply rate summary for tier verification
    cad_stats = defaultdict(lambda: {"sends": 0, "replies": 0, "name": "", "tier": ""})
    for act in activities:
        cid = act["cadence"]["id"]
        cad_stats[cid]["sends"]   += 1
        cad_stats[cid]["replies"] += act["replies"]
    for cad in cadences:
        cad_stats[cad["id"]]["name"] = cad["name"]
        cad_stats[cad["id"]]["tier"] = cad.get("_tier", "?")
    print(f"\n{'CadID':>6} {'Tier':>6} {'Sends':>6} {'RepR':>7}  Name")
    print("-" * 70)
    for cid in sorted(cad_stats):
        cs = cad_stats[cid]
        rep_r = cs["replies"] / cs["sends"] if cs["sends"] else 0
        print(f"{cid:>6} {cs['tier']:>6} {cs['sends']:>6} {rep_r:>6.1%}  {cs['name']}")


def main():
    print("Generating Salesloft synthetic data...")
    cadences   = generate_cadences()
    steps      = generate_steps(cadences)
    activities = generate_email_activity(cadences, steps)

    # Strip internal helper fields before serialization
    for cad in cadences:
        cad.pop("_num_steps", None)

    for fname, data in [("sl_cadences.json", cadences), ("sl_steps.json", steps), ("sl_email_activity.json", activities)]:
        path = OUTPUT_DIR / fname
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  Wrote {len(data):>5} records → {path}")

    print_summary(cadences, steps, activities)
    print("\nDone.")

if __name__ == "__main__":
    main()
