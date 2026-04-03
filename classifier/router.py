"""Stage 4: Section router — select knowledge base sections for the rewrite prompt."""

import json
import os
from pathlib import Path

# Load knowledge base once at module import
_REPO_ROOT = Path(__file__).resolve().parent.parent
_KB_PATH = _REPO_ROOT / "knowledge" / "beacon_messaging_intelligence.json"

with open(_KB_PATH, "r", encoding="utf-8") as _f:
    KNOWLEDGE_BASE = json.load(_f)

# persona_configs.name (DB) → part_5_personas key (JSON)
PERSONA_NAME_TO_KB_KEY = {
    "CISO": "ciso_security",
    "VP Engineering": "cto_vp_engineering",
    "IT Director": "vp_director",
    "CTO": "cto_vp_engineering",
    "Security Engineer": "individual_contributor",
    "VP Sales": "cro_vp_sales",
    "VP Marketing": "cmo_vp_marketing",
    "CFO": "cfo_finance",
}

# Labels for each part (human-readable)
PART_LABELS = {
    "part_1_invariant_rules": "Invariant Rules",
    "part_2_failure_modes": "Failure Modes",
    "part_3_methodology": "Methodology Selection Matrix",
    "part_4_rewrite_directions": "Rewrite Directions",
    "part_5_personas": "Persona Guidance",
    "part_6_verticals": "Vertical Intelligence",
    "part_7_buyer_calendar": "Buyer Calendar",
    "part_8_sequence_architecture": "Sequence Architecture",
    "part_9_benchmarks": "Performance Benchmarks",
    "part_10_output_format": "Output Format",
}


def route(classifier_output: dict, context: dict) -> dict:
    """Route classifier output to relevant knowledge base sections.

    Args:
        classifier_output: dict from post_classify() with keys:
            final_signal_class, detected_failure_modes, severity, routing_hints
        context: dict with keys:
            persona_tier, deal_type, vertical, sequence_stage, persona_name

    Returns:
        dict with keys:
            system_prompt_sections, token_estimate, routing_log, is_full_fallback
    """
    is_full_fallback = classifier_output["final_signal_class"] == "NONE_DETECTED"
    routing_hints = set(classifier_output.get("routing_hints", []))
    routing_log = []
    sections = []

    # --- Part 1: Invariant rules — always ---
    _add_section(sections, "part_1_invariant_rules", KNOWLEDGE_BASE["part_1_invariant_rules"])
    routing_log.append("part_1_invariant_rules: always included")

    # --- Part 2: Failure modes — specific FMs or all if fallback ---
    if is_full_fallback:
        _add_section(sections, "part_2_failure_modes", KNOWLEDGE_BASE["part_2_failure_modes"])
        routing_log.append("part_2_failure_modes: full fallback — all 10 FMs included")
    else:
        fm_data = KNOWLEDGE_BASE["part_2_failure_modes"]
        selected_fms = {}
        for hint in sorted(routing_hints):
            if hint.startswith("part_2_failure_modes."):
                fm_key = hint.split(".", 1)[1]
                if fm_key in fm_data:
                    selected_fms[fm_key] = fm_data[fm_key]
                    routing_log.append(f"part_2_failure_modes.{fm_key}: detected FM")
        if selected_fms:
            _add_section(sections, "part_2_failure_modes", selected_fms)
        else:
            routing_log.append("part_2_failure_modes: no FMs detected, section skipped")

    # --- Part 3: Methodology — always; filter primary_matrix rows ---
    methodology = KNOWLEDGE_BASE["part_3_methodology"]
    persona_tier = context.get("persona_tier")
    deal_type = context.get("deal_type")
    filtered_rows = [
        row for row in methodology["primary_matrix"]
        if _tier_matches(row.get("persona_tier", ""), persona_tier)
        and _deal_matches(row.get("deal_type", ""), deal_type)
    ] if persona_tier and deal_type else []

    if filtered_rows:
        filtered_methodology = {
            "primary_matrix": filtered_rows,
            "stage_modifiers": methodology["stage_modifiers"],
        }
        routing_log.append(
            f"part_3_methodology: {len(filtered_rows)} rows matching "
            f"persona_tier={persona_tier}, deal_type={deal_type}"
        )
    else:
        filtered_methodology = methodology
        reason = "no match" if persona_tier and deal_type else "missing persona_tier or deal_type"
        routing_log.append(f"part_3_methodology: all rows included ({reason})")
    _add_section(sections, "part_3_methodology", filtered_methodology)

    # --- Part 4: Rewrite directions — specific hints or all if fallback ---
    if is_full_fallback:
        _add_section(sections, "part_4_rewrite_directions", KNOWLEDGE_BASE["part_4_rewrite_directions"])
        routing_log.append("part_4_rewrite_directions: full fallback — all directions included")
    else:
        rd_data = KNOWLEDGE_BASE["part_4_rewrite_directions"]
        selected_dirs = {}
        for hint in sorted(routing_hints):
            if hint.startswith("part_4_rewrite_directions."):
                dir_key = hint.split(".", 1)[1]
                if dir_key in rd_data:
                    selected_dirs[dir_key] = rd_data[dir_key]
                    routing_log.append(f"part_4_rewrite_directions.{dir_key}: referenced in routing hints")
        if selected_dirs:
            _add_section(sections, "part_4_rewrite_directions", selected_dirs)
        else:
            routing_log.append("part_4_rewrite_directions: no directions referenced, section skipped")

    # --- Part 5: Personas — single entry matching context.persona_name ---
    persona_name = context.get("persona_name")
    if persona_name:
        persona_data = KNOWLEDGE_BASE.get("part_5_personas", {})
        matched_persona = None
        # First: try the explicit DB-name → JSON-key mapping
        mapped_key = PERSONA_NAME_TO_KB_KEY.get(persona_name)
        if mapped_key and mapped_key in persona_data:
            matched_persona = {mapped_key: persona_data[mapped_key]}
        else:
            # Fallback: case-insensitive scan on JSON keys
            for key, val in persona_data.items():
                if key.lower() == persona_name.lower():
                    matched_persona = {key: val}
                    break
        if matched_persona:
            _add_section(sections, "part_5_personas", matched_persona)
            routing_log.append(f"part_5_personas: matched '{persona_name}'")
        else:
            routing_log.append(f"part_5_personas: no match for '{persona_name}', section skipped")
    else:
        routing_log.append("part_5_personas: persona_name not set, section skipped")

    # --- Part 6: Verticals — single entry matching context.vertical ---
    vertical = context.get("vertical")
    if vertical:
        vertical_data = KNOWLEDGE_BASE.get("part_6_verticals", {})
        matched_vertical = None
        for key, val in vertical_data.items():
            if key.lower() == vertical.lower():
                matched_vertical = {key: val}
                break
        if matched_vertical:
            _add_section(sections, "part_6_verticals", matched_vertical)
            routing_log.append(f"part_6_verticals: matched '{vertical}'")
        else:
            routing_log.append(f"part_6_verticals: no match for '{vertical}', section skipped")
    else:
        routing_log.append("part_6_verticals: vertical not set, section skipped")

    # --- Part 7: Buyer calendar — skip always in v1 ---
    routing_log.append("part_7_buyer_calendar: skipped (v1 — not enough context)")

    # --- Part 8: Sequence architecture — breakup or first touch only ---
    sequence_stage = context.get("sequence_stage")
    is_first_touch = sequence_stage == "first_touch" if sequence_stage else False
    is_breakup = sequence_stage == "breakup" if sequence_stage else False
    if is_breakup or is_first_touch:
        _add_section(sections, "part_8_sequence_architecture", KNOWLEDGE_BASE["part_8_sequence_architecture"])
        routing_log.append(f"part_8_sequence_architecture: included (sequence_stage={sequence_stage})")
    else:
        routing_log.append(f"part_8_sequence_architecture: skipped (sequence_stage={sequence_stage})")

    # --- Part 9: Benchmarks — always, absolute only ---
    benchmarks_absolute = {"absolute": KNOWLEDGE_BASE["part_9_benchmarks"]["absolute"]}
    _add_section(sections, "part_9_benchmarks", benchmarks_absolute)
    routing_log.append("part_9_benchmarks: absolute thresholds only (relative_triggers excluded)")

    # --- Part 10: Output format — always ---
    _add_section(sections, "part_10_output_format", KNOWLEDGE_BASE["part_10_output_format"])
    routing_log.append("part_10_output_format: always included")

    # Token estimate
    token_estimate = sum(len(s["content"]) for s in sections) // 4

    return {
        "system_prompt_sections": sections,
        "token_estimate": token_estimate,
        "routing_log": routing_log,
        "is_full_fallback": is_full_fallback,
    }


def _add_section(sections: list, key: str, data: dict) -> None:
    """Append a section dict to the sections list."""
    sections.append({
        "key": key,
        "label": PART_LABELS.get(key, key),
        "content": json.dumps(data, separators=(",", ":")),
    })


def _normalize_slash(s: str) -> str:
    """Normalize spaces around '/' — 'VP / Director' → 'VP/Director'."""
    import re
    return re.sub(r'\s*/\s*', '/', s)


def _tier_matches(row_tier: str, context_tier: str | None) -> bool:
    """Check if a methodology matrix row's persona_tier matches the context."""
    if not context_tier:
        return False
    row_norm = _normalize_slash(row_tier).lower()
    ctx_norm = _normalize_slash(context_tier).lower()
    return row_norm == ctx_norm or ctx_norm in row_norm


def _deal_matches(row_deal: str, context_deal: str | None) -> bool:
    """Check if a methodology matrix row's deal_type matches the context."""
    if not context_deal:
        return False
    row_norm = _normalize_slash(row_deal).lower()
    ctx_norm = _normalize_slash(context_deal).lower()
    return row_norm == ctx_norm or ctx_norm in row_norm or row_norm in ("any", "any deal type")
