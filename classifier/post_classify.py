"""Stage 3: Post-classification — merge performance + copy signals into final output."""

# FM code -> Part 4 rewrite direction keys
FM_TO_DIRECTIONS = {
    "fm1": ["problem_flip"],
    "fm2": ["personalization_repair"],
    "fm3": ["persona_recalibration", "methodology_swap"],
    "fm4": ["cta_simplification"],
    "fm5": ["compression"],
    "fm6": ["challenger_reframe", "social_proof_injection"],
    "fm7": ["methodology_swap"],
    "fm8": ["stage_realignment"],
    "fm9": ["breakup_sharpening", "sandler_reverse"],
    "fm10": ["subject_alignment"],
}

# FM code -> knowledge base key mapping
FM_KEY_MAP = {
    "fm1": "fm1_feature_led_opening",
    "fm2": "fm2_fake_personalization",
    "fm3": "fm3_wrong_persona_targeting",
    "fm4": "fm4_cta_overload",
    "fm5": "fm5_too_long_too_dense",
    "fm6": "fm6_too_vague_too_safe",
    "fm7": "fm7_methodology_mismatch",
    "fm8": "fm8_buying_stage_mismatch",
    "fm9": "fm9_breakup_without_tension",
    "fm10": "fm10_subject_body_misalignment",
}

# Persona tier -> knowledge base persona key
PERSONA_TIER_MAP = {
    "C-suite (CEO, CRO, CFO, CISO)": "c_suite",
    "C-suite": "c_suite",
    "CEO": "ceo",
    "CRO": "cro",
    "CFO": "cfo",
    "CISO": "ciso",
    "VP / Director": "vp_director",
    "VP": "vp_director",
    "Director": "vp_director",
    "Manager / IC": "manager_ic",
    "Manager": "manager_ic",
    "IC": "manager_ic",
    "RevOps / GTM Ops": "revops",
    "RevOps": "revops",
    "GTM Ops": "revops",
    "CISO / Security": "ciso",
}

ALL_PART_KEYS = [
    "part_1_invariant_rules",
    "part_2_failure_modes",
    "part_3_methodology",
    "part_4_rewrite_directions",
    "part_5_personas",
    "part_6_verticals",
    "part_7_buyer_calendar",
    "part_8_sequence_architecture",
    "part_9_benchmarks",
    "part_10_output_format",
]


def post_classify(
    performance_result: dict,
    copy_result: dict,
    context: dict,
) -> dict:
    """Merge performance and copy analysis into final classification with routing hints."""

    detected_failure_modes = []
    routing_hints = set()

    # Always include invariant rules and methodology
    routing_hints.add("part_1_invariant_rules")
    routing_hints.add("part_3_methodology")

    copy_available = copy_result.get("copy_available", False)

    # --- FM1: feature-led opening ---
    if copy_available and (
        copy_result.get("starts_with_we_or_our") is True
        or len(copy_result.get("detected_buzzwords") or []) >= 2
    ):
        detected_failure_modes.append({
            "code": "fm1",
            "name": "feature_led_opening",
            "confidence": "heuristic",
            "rationale": _fm1_rationale(copy_result),
        })

    # --- FM2: fake personalization ---
    if copy_available and (
        copy_result.get("has_template_variables") is True
        and (copy_result.get("word_count") or 0) < 60
    ):
        detected_failure_modes.append({
            "code": "fm2",
            "name": "fake_personalization",
            "confidence": "heuristic",
            "rationale": "Short templated email with merge fields — likely fake personalization",
        })

    # --- FM3: wrong persona targeting ---
    if (
        performance_result.get("preliminary_signal_class") == "TOTAL_DEGRADATION"
        and performance_result.get("severity") == "CRITICAL"
    ):
        detected_failure_modes.append({
            "code": "fm3",
            "name": "wrong_persona_targeting",
            "confidence": "confirmed",
            "rationale": "Total degradation with critical severity — all KPIs collapsed",
        })

    # --- FM4: CTA overload ---
    if copy_available and (
        copy_result.get("has_multiple_questions") is True
        or copy_result.get("has_multiple_links") is True
    ):
        detected_failure_modes.append({
            "code": "fm4",
            "name": "cta_overload",
            "confidence": "heuristic",
            "rationale": _fm4_rationale(copy_result),
        })

    # --- FM5: too long / too dense ---
    if copy_available and (
        copy_result.get("body_word_count_flag") is True
        or (copy_result.get("max_paragraph_sentences") or 0) >= 4
    ):
        detected_failure_modes.append({
            "code": "fm5",
            "name": "too_long_too_dense",
            "confidence": "heuristic",
            "rationale": _fm5_rationale(copy_result),
        })

    # --- FM6: too vague / too safe ---
    if copy_available and (
        (copy_result.get("word_count") or 0) < 30
        and (copy_result.get("question_count") or 0) == 0
    ):
        detected_failure_modes.append({
            "code": "fm6",
            "name": "too_vague_too_safe",
            "confidence": "heuristic",
            "rationale": "Very short email with no questions — no hook or CTA",
        })

    # --- FM7: methodology mismatch ---
    if (
        performance_result.get("preliminary_signal_class") == "RELATIVE_UNDERPERFORMER"
        and context.get("persona_tier") is not None
    ):
        detected_failure_modes.append({
            "code": "fm7",
            "name": "methodology_mismatch",
            "confidence": "confirmed",
            "rationale": "Relative underperformer with known persona tier — likely methodology mismatch",
        })

    # --- FM8: buying stage mismatch ---
    if (
        performance_result.get("is_first_touch") is True
        and copy_available
        and copy_result.get("has_multiple_links") is True
    ):
        detected_failure_modes.append({
            "code": "fm8",
            "name": "buying_stage_mismatch",
            "confidence": "heuristic",
            "rationale": "First touch with multiple links — solution-stage signals on first touch",
        })

    # --- FM9: breakup without tension ---
    if (
        performance_result.get("is_breakup_step") is True
        and copy_available
        and (copy_result.get("question_count") or 0) == 0
    ):
        detected_failure_modes.append({
            "code": "fm9",
            "name": "breakup_without_tension",
            "confidence": "heuristic",
            "rationale": "Breakup step with no questions — no decision point or tension",
        })

    # --- FM10: subject-body misalignment ---
    if (
        performance_result.get("open_rate_assessment") in ("good", "excellent")
        and performance_result.get("reply_rate_assessment") == "below_flag"
    ):
        detected_failure_modes.append({
            "code": "fm10",
            "name": "subject_body_misalignment",
            "confidence": "confirmed",
            "rationale": "Good/excellent opens but flagged reply rate — subject got clicks, body lost them",
        })

    # --- Build routing hints ---
    for fm in detected_failure_modes:
        fm_key = FM_KEY_MAP.get(fm["code"])
        if fm_key:
            routing_hints.add(f"part_2_failure_modes.{fm_key}")

    # Part 4 rewrite direction hints from detected FMs
    for fm in detected_failure_modes:
        direction_keys = FM_TO_DIRECTIONS.get(fm["code"], [])
        for dk in direction_keys:
            routing_hints.add(f"part_4_rewrite_directions.{dk}")

    # Conditional Part 4 hints based on context
    sequence_stage = context.get("sequence_stage")
    if sequence_stage in ("follow_up_early", "follow_up_late"):
        routing_hints.add("part_4_rewrite_directions.followup_fresh_angle")
    if context.get("vertical") is not None:
        routing_hints.add("part_4_rewrite_directions.vertical_pain_injection")

    # Persona routing
    persona_tier = context.get("persona_tier")
    if persona_tier is not None:
        persona_key = PERSONA_TIER_MAP.get(persona_tier, persona_tier.lower().replace(" ", "_"))
        routing_hints.add(f"part_5_personas.{persona_key}")

    # Vertical routing
    vertical = context.get("vertical")
    if vertical is not None:
        vertical_key = vertical.lower().replace(" ", "_").replace("-", "_")
        routing_hints.add(f"part_6_verticals.{vertical_key}")

    # --- Final signal class ---
    if not detected_failure_modes:
        final_signal_class = "NONE_DETECTED"
        routing_hints = set(ALL_PART_KEYS)
    else:
        prelim = performance_result.get("preliminary_signal_class")
        if prelim:
            final_signal_class = prelim
        else:
            # Performance metrics didn't match a signal class, but copy
            # heuristics found failure modes — infer from FM types
            final_signal_class = _infer_signal_class_from_fms(detected_failure_modes)

    # Severity
    severity = performance_result.get("severity", "LOW")
    if not performance_result.get("preliminary_signal_class"):
        severity = "LOW"

    return {
        "final_signal_class": final_signal_class,
        "detected_failure_modes": detected_failure_modes,
        "severity": severity,
        "routing_hints": sorted(routing_hints),
    }


def _fm1_rationale(copy_result: dict) -> str:
    parts = []
    if copy_result.get("starts_with_we_or_our"):
        parts.append("opens with 'We'/'Our'")
    buzzwords = copy_result.get("detected_buzzwords") or []
    if len(buzzwords) >= 2:
        parts.append(f"buzzwords detected: {', '.join(buzzwords)}")
    return "Feature-led opening — " + "; ".join(parts)


def _fm4_rationale(copy_result: dict) -> str:
    parts = []
    if copy_result.get("has_multiple_questions"):
        parts.append(f"{copy_result.get('question_count', 0)} questions")
    if copy_result.get("has_multiple_links"):
        parts.append("multiple links")
    return "CTA overload — " + ", ".join(parts)


def _fm5_rationale(copy_result: dict) -> str:
    parts = []
    if copy_result.get("body_word_count_flag"):
        parts.append(f"{copy_result.get('word_count', 0)} words (>100)")
    max_para = copy_result.get("max_paragraph_sentences") or 0
    if max_para >= 4:
        parts.append(f"paragraph with {max_para} sentences")
    return "Too long/dense — " + ", ".join(parts)


def _infer_signal_class_from_fms(fms: list[dict]) -> str:
    """Infer a signal class when performance classifier returned None but FMs exist."""
    fm_codes = {fm["code"] for fm in fms}
    if "fm4" in fm_codes:
        return "CTA_OR_QUALIFICATION"
    if "fm10" in fm_codes:
        return "SUBJECT_OR_DELIVERABILITY"
    if fm_codes & {"fm1", "fm2", "fm5", "fm6"}:
        return "BODY_COPY_PROBLEM"
    if "fm9" in fm_codes:
        return "BODY_COPY_PROBLEM"
    return "BODY_COPY_PROBLEM"
