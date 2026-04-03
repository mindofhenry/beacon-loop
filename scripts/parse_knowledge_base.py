#!/usr/bin/env python3
"""
One-time parser: docs/beacon_messaging_intelligence.md
Output: knowledge/beacon_messaging_intelligence.json
Standard library only — no third-party dependencies.
"""

import re
import json
import os

INPUT_PATH = "docs/beacon_messaging_intelligence.md"
OUTPUT_PATH = "knowledge/beacon_messaging_intelligence.json"


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

def parse_markdown_table(text):
    """Parse a markdown table block into a list of dicts keyed by header."""
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    table_lines = [l for l in lines if l.startswith("|")]
    if len(table_lines) < 2:
        return []

    headers = [h.strip() for h in table_lines[0].split("|") if h.strip()]
    rows = []
    for line in table_lines[1:]:
        # Skip separator rows (only dashes, spaces, pipes)
        if re.match(r"^\|[\-\s|]+\|$", line):
            continue
        cells = [c.strip() for c in line.split("|")]
        cells = [c for c in cells if c != ""]
        # Pad or trim to match header count
        if len(cells) < len(headers):
            cells += [""] * (len(headers) - len(cells))
        elif len(cells) > len(headers):
            cells = cells[: len(headers)]
        rows.append(dict(zip(headers, cells)))
    return rows


def split_into_parts(content):
    """Split document on '## Part N:' headings. Returns {part_num: text}."""
    parts = {}
    pattern = re.compile(r"^## Part (\d+):", re.MULTILINE)
    matches = list(pattern.finditer(content))
    for i, match in enumerate(matches):
        part_num = int(match.group(1))
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        parts[part_num] = content[start:end]
    return parts


def split_cares_about(text):
    """Comma-split that respects parentheses (e.g. 'compliance (HIPAA, PCI)')."""
    items = []
    depth = 0
    current = []
    for char in text:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth -= 1
            current.append(char)
        elif char == "," and depth == 0:
            items.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if current:
        items.append("".join(current).strip())
    return [i for i in items if i]


def normalize_key(name):
    """Lowercase, replace non-alphanumeric runs with underscore, strip edges."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


# ---------------------------------------------------------------------------
# Part parsers
# ---------------------------------------------------------------------------

def parse_part1(text):
    """Invariant rules table → {rules: [...]}"""
    rows = parse_markdown_table(text)
    rules = []
    for row in rows:
        rules.append({
            "rule": row.get("Rule", ""),
            "threshold": row.get("Threshold", ""),
            "source": row.get("Source", ""),
        })
    return {"rules": rules}


FM_KEY_MAP = {
    1: "fm1_feature_led_opening",
    2: "fm2_fake_personalization",
    3: "fm3_wrong_persona_targeting",
    4: "fm4_cta_overload",
    5: "fm5_too_long_too_dense",
    6: "fm6_too_vague_too_safe",
    7: "fm7_methodology_mismatch",
    8: "fm8_buying_stage_mismatch",
    9: "fm9_breakup_without_tension",
    10: "fm10_subject_body_misalignment",
}


def parse_part2(text):
    """10 failure modes → {fm1_...: {data_signal, copy_signal, rewrite_direction}}"""
    fm_pattern = re.compile(r"### Failure Mode (\d+): (.+)")
    matches = list(fm_pattern.finditer(text))
    result = {}
    for i, match in enumerate(matches):
        fm_num = int(match.group(1))
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end].strip()

        ds_m = re.search(r"\*\*Data signal:\*\* (.+)", block)
        cs_m = re.search(r"\*\*Copy signal:\*\* (.+)", block)
        rd_m = re.search(r"\*\*Rewrite direction:\*\* (.+)", block)

        key = FM_KEY_MAP.get(fm_num, f"fm{fm_num}")
        result[key] = {
            "data_signal": ds_m.group(1).strip() if ds_m else "",
            "copy_signal": cs_m.group(1).strip() if cs_m else "",
            "rewrite_direction": rd_m.group(1).strip() if rd_m else "",
        }
    return result


def parse_part3(text):
    """Methodology matrix + stage modifiers."""
    # Primary matrix
    matrix_m = re.search(
        r"### Primary Methodology Selection Matrix\n\n(.+?)(?=\n### |\Z)",
        text, re.DOTALL
    )
    primary_matrix = []
    if matrix_m:
        for row in parse_markdown_table(matrix_m.group(1)):
            sec = row.get("Secondary", "").strip()
            primary_matrix.append({
                "persona_tier": row.get("Persona Tier", ""),
                "deal_type": row.get("Deal Type", ""),
                "sequence_stage": row.get("Sequence Stage", ""),
                "primary_method": row.get("Primary Method", ""),
                "secondary": None if sec in ("—", "–", "−", "") else sec,
            })

    # Stage modifiers
    stage_m = re.search(
        r"### Sequence Stage Modifiers\n\n(.+?)(?=\n### |\Z)",
        text, re.DOTALL
    )
    stage_modifiers = {}
    if stage_m:
        s = stage_m.group(1)

        def get_mod(pattern):
            m = re.search(pattern, s)
            return m.group(1).strip() if m else ""

        stage_modifiers["first_touch"] = get_mod(r"\*\*First touch:\*\* (.+)")
        stage_modifiers["follow_up_early"] = get_mod(r"\*\*Follow-up 1.2:\*\* (.+)")
        stage_modifiers["follow_up_late"] = get_mod(r"\*\*Follow-up 3.4:\*\* (.+)")
        stage_modifiers["breakup"] = get_mod(r"\*\*Breakup:\*\* (.+)")

    return {"primary_matrix": primary_matrix, "stage_modifiers": stage_modifiers}


DIRECTION_KEY_MAP = {
    "Problem Flip": "problem_flip",
    "Compression": "compression",
    "Challenger Reframe": "challenger_reframe",
    "Sandler Reverse": "sandler_reverse",
    "Persona Recalibration": "persona_recalibration",
    "CTA Simplification": "cta_simplification",
    "Social Proof Injection": "social_proof_injection",
    "Stage Realignment": "stage_realignment",
    "Subject Alignment": "subject_alignment",
    "Personalization Repair": "personalization_repair",
    "Breakup Sharpening": "breakup_sharpening",
    "Methodology Swap": "methodology_swap",
    "Vertical Pain Injection": "vertical_pain_injection",
    "Timing Pivot": "timing_pivot",
    "Follow-up Fresh Angle": "followup_fresh_angle",
}


def parse_part4(text):
    """Rewrite direction taxonomy → {direction_key: {name, when_to_use, structure, constraints}}"""
    rows = parse_markdown_table(text)
    result = {}
    for row in rows:
        raw = row.get("Direction Name", "").strip("* \t")
        key = DIRECTION_KEY_MAP.get(raw, normalize_key(raw))
        result[key] = {
            "name": raw,
            "when_to_use": row.get("When to Apply", ""),
            "structure": row.get("What Changes", ""),
            "constraints": "",
        }
    return result


PERSONA_KEY_MAP = {
    "CEO / Founder (SMB/Mid-market)": ("ceo_founder", "c_suite"),
    "CFO / Finance Buyer": ("cfo_finance", "c_suite"),
    "CRO / VP Sales": ("cro_vp_sales", "c_suite"),
    "CISO / Security Buyer": ("ciso_security", "c_suite"),
    "CMO / VP Marketing": ("cmo_vp_marketing", "c_suite"),
    "CTO / VP Engineering": ("cto_vp_engineering", "c_suite"),
    "VP / Director (any function)": ("vp_director", "mid_level"),
    "RevOps / GTM Ops": ("revops_gtm_ops", "mid_level"),
    "Manager / Team Lead": ("manager_team_lead", "mid_level"),
    "HR / People Ops": ("hr_people_ops", "mid_level"),
    "Individual Contributor / End User": ("individual_contributor", "mid_level"),
    "Procurement / Legal": ("procurement_legal", "mid_level"),
}


def parse_part5(text):
    """12 personas → {persona_key: {title, tier, pain_points, tone, what_works, what_doesnt}}"""
    personas = {}
    persona_pattern = re.compile(r"\*\*(.+?)\*\*\s*\n((?:- .+\n?)+)", re.MULTILINE)

    for match in persona_pattern.finditer(text):
        title = match.group(1).strip()
        if title not in PERSONA_KEY_MAP:
            continue

        key, tier = PERSONA_KEY_MAP[title]
        bullets_text = match.group(2)

        pain_points = []
        tone = ""
        what_works_parts = []
        what_doesnt = ""

        for line in bullets_text.strip().split("\n"):
            line = line.strip()
            if not line.startswith("- "):
                continue
            content = line[2:]

            if content.startswith("Cares about:"):
                pain_points = split_cares_about(content[len("Cares about:"):].strip())
            elif content.startswith("Tone:"):
                tone = content[len("Tone:"):].strip()
            elif content.startswith("Best method:"):
                what_works_parts.append(content[len("Best method:"):].strip())
            elif content.startswith("CTA:"):
                what_works_parts.append("CTA: " + content[len("CTA:"):].strip())
            elif content.startswith("Avoid:"):
                what_doesnt = content[len("Avoid:"):].strip()

        personas[key] = {
            "title": title,
            "tier": tier,
            "pain_points": pain_points,
            "tone": tone,
            "what_works": "; ".join(what_works_parts),
            "what_doesnt": what_doesnt,
        }

    return personas


def parse_part6(text):
    """12 verticals → {vertical_key: {name, buyer_priorities, language_that_works, avoid}}"""
    # Parse methodology table
    table_m = re.search(
        r"### Methodology × Vertical Fit\n\n(.+?)(?=\n### |\Z)",
        text, re.DOTALL
    )
    table_rows = {}
    if table_m:
        for row in parse_markdown_table(table_m.group(1)):
            name = row.get("Vertical", "").strip()
            if name:
                table_rows[name] = row

    # Parse pain language blocks: **Name:** lang\n**Avoid:** avoid
    pain_m = re.search(
        r"### Vertical Pain Language Index\n\n(.+?)(?=\n---|\Z)",
        text, re.DOTALL
    )
    pain_blocks = {}
    if pain_m:
        block_pattern = re.compile(
            r"\*\*([^*\n]+?):\*\* (.+?)\n\*\*Avoid:\*\* (.+?)(?=\n\n|\Z)",
            re.DOTALL
        )
        for bm in block_pattern.finditer(pain_m.group(1)):
            vname = bm.group(1).strip()
            lang = re.sub(r"\s+", " ", bm.group(2)).strip()
            avoid = re.sub(r"\s+", " ", bm.group(3)).strip()
            pain_blocks[vname] = {"language_that_works": lang, "avoid": avoid}

    verticals = {}
    for name, row in table_rows.items():
        key = normalize_key(name)
        pain = pain_blocks.get(name, {})
        entry_point = row.get("Entry Point", "").strip()
        primary_method = row.get("Primary Method", "").strip()
        verticals[key] = {
            "name": name,
            "buyer_priorities": entry_point if entry_point else primary_method,
            "language_that_works": pain.get("language_that_works", ""),
            "avoid": pain.get("avoid", ""),
        }

    return verticals


def parse_part7(text):
    """11 timing contexts → {timing_key: {buyer_state, angle_that_works, avoid, cta_adjustment}}"""
    table_m = re.search(
        r"### Timing Context → Messaging Pivot\n\n(.+?)(?=\n---|\Z)",
        text, re.DOTALL
    )
    result = {}
    if table_m:
        for row in parse_markdown_table(table_m.group(1)):
            context = row.get("Timing Context", "").strip()
            if context:
                key = normalize_key(context)
                result[key] = {
                    "buyer_state": row.get("Buyer State", ""),
                    "angle_that_works": row.get("Angle That Works", ""),
                    "avoid": row.get("Avoid", ""),
                    "cta_adjustment": row.get("CTA Adjustment", ""),
                }
    return result


def parse_part8(text):
    """Sequence architecture: optimal structure, channel fields, CTA table, never list."""
    # Optimal structure table
    struct_m = re.search(
        r"### Optimal Sequence Structure by Deal Type\n\n(.+?)(?=\n\*\*Channel|\Z)",
        text, re.DOTALL
    )
    optimal_structure = []
    if struct_m:
        for row in parse_markdown_table(struct_m.group(1)):
            optimal_structure.append({
                "deal_type": row.get("Deal Type", ""),
                "step_count": row.get("Step Count", ""),
                "email_steps": row.get("Email Steps", ""),
                "phone_steps": row.get("Phone Steps", ""),
                "linkedin_steps": row.get("LinkedIn Steps", ""),
                "duration": row.get("Duration", ""),
            })

    def get_field(pattern):
        m = re.search(pattern, text)
        return m.group(1).strip() if m else ""

    channel_pattern = get_field(r"\*\*Channel sequence pattern[^:]*:\*\* (.+)")
    day_spacing = get_field(r"\*\*Day spacing:\*\* (.+)")
    reply_distribution = get_field(r"\*\*Reply distribution:\*\* (.+)")
    multichannel_multiplier = get_field(r"\*\*Multichannel multiplier:\*\* (.+)")

    # CTA by stage table
    cta_m = re.search(
        r"### CTA by Sequence Stage\n\n(.+?)(?=\n\*\*Never|\Z)",
        text, re.DOTALL
    )
    cta_by_stage = []
    if cta_m:
        for row in parse_markdown_table(cta_m.group(1)):
            cta_by_stage.append({
                "stage": row.get("Stage", ""),
                "cta_type": row.get("CTA Type", ""),
                "example": row.get("Example", ""),
            })

    # Never on first touch
    never_m = re.search(r"\*\*Never on first touch:\*\* (.+)", text)
    never_on_first_touch = []
    if never_m:
        never_on_first_touch = [item.strip() for item in never_m.group(1).split(",")]

    return {
        "optimal_structure": optimal_structure,
        "channel_pattern": channel_pattern,
        "day_spacing": day_spacing,
        "reply_distribution": reply_distribution,
        "multichannel_multiplier": multichannel_multiplier,
        "cta_by_stage": cta_by_stage,
        "never_on_first_touch": never_on_first_touch,
    }


def parse_part9(text):
    """Benchmarks: absolute table + relative triggers list."""
    # The table starts with '| Metric'
    table_m = re.search(r"(\| Metric .+\n(?:\|.+\n)+)", text)
    absolute = []
    if table_m:
        for row in parse_markdown_table(table_m.group(1)):
            absolute.append({
                "metric": row.get("Metric", ""),
                "average": row.get("Average", ""),
                "good": row.get("Good", ""),
                "excellent": row.get("Excellent", ""),
                "flag_threshold": row.get("Flag Threshold", ""),
            })

    triggers_m = re.search(
        r"\*\*Relative underperformance triggers:\*\*\s*\n((?:- .+\n?)+)", text
    )
    relative_triggers = []
    if triggers_m:
        for line in triggers_m.group(1).strip().split("\n"):
            line = line.strip()
            if line.startswith("- "):
                relative_triggers.append(line[2:])

    return {"absolute": absolute, "relative_triggers": relative_triggers}


def parse_part10(text):
    """Tier 1–3 lists + minimum viable output structure."""

    def get_numbered_list(heading_pattern):
        m = re.search(heading_pattern + r"\s*\n((?:\d+\. .+\n?)+)", text)
        if not m:
            return []
        return re.findall(r"\d+\. (.+)", m.group(1))

    return {
        "tier_1_required": get_numbered_list(r"\*\*Tier 1[^*]+:\*\*"),
        "tier_2_high_value": get_numbered_list(r"\*\*Tier 2[^*]+:\*\*"),
        "tier_3_contextual": get_numbered_list(r"\*\*Tier 3[^*]+:\*\*"),
        "minimum_viable_output_structure": get_numbered_list(
            r"\*\*Minimum viable output structure[^*]+:\*\*"
        ),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    source_line_count = len(content.split("\n"))
    parts = split_into_parts(content)

    output = {
        "meta": {
            "version": "1.0",
            "source_line_count": source_line_count,
            "part_count": 10,
        },
        "part_1_invariant_rules": parse_part1(parts[1]),
        "part_2_failure_modes": parse_part2(parts[2]),
        "part_3_methodology": parse_part3(parts[3]),
        "part_4_rewrite_directions": parse_part4(parts[4]),
        "part_5_personas": parse_part5(parts[5]),
        "part_6_verticals": parse_part6(parts[6]),
        "part_7_buyer_calendar": parse_part7(parts[7]),
        "part_8_sequence_architecture": parse_part8(parts[8]),
        "part_9_benchmarks": parse_part9(parts[9]),
        "part_10_output_format": parse_part10(parts[10]),
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # --- Validation summary ---
    p2 = output["part_2_failure_modes"]
    p3 = output["part_3_methodology"]
    p9 = output["part_9_benchmarks"]

    print(f"Written:              {OUTPUT_PATH}")
    print(f"Source lines:         {source_line_count}")
    print(f"Parts parsed:         {sorted(parts.keys())}")
    print()
    print(f"Part 1  rules:        {len(output['part_1_invariant_rules']['rules'])}")
    print(f"Part 2  failure modes:{len(p2)} (keys: {list(p2.keys())})")
    print(f"Part 3  matrix rows:  {len(p3['primary_matrix'])}")
    print(f"Part 3  stage mods:   {list(p3['stage_modifiers'].keys())}")
    print(f"Part 4  directions:   {len(output['part_4_rewrite_directions'])}")
    print(f"Part 5  personas:     {len(output['part_5_personas'])}")
    print(f"Part 6  verticals:    {len(output['part_6_verticals'])}")
    print(f"Part 7  timing ctxs:  {len(output['part_7_buyer_calendar'])}")
    p8 = output["part_8_sequence_architecture"]
    print(f"Part 8  deal rows:    {len(p8['optimal_structure'])}")
    print(f"Part 8  CTA stages:   {len(p8['cta_by_stage'])}")
    print(f"Part 9  benchmarks:   {len(p9['absolute'])}")
    print(f"Part 9  rel triggers: {len(p9['relative_triggers'])}")
    p10 = output["part_10_output_format"]
    print(f"Part 10 tier1:        {len(p10['tier_1_required'])}")
    print(f"Part 10 tier2:        {len(p10['tier_2_high_value'])}")
    print(f"Part 10 tier3:        {len(p10['tier_3_contextual'])}")
    print(f"Part 10 mvo:          {len(p10['minimum_viable_output_structure'])}")


if __name__ == "__main__":
    main()
