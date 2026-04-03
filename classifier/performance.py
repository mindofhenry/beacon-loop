"""Stage 1: Performance-based signal classification."""


def _assess_open_rate(open_rate: float) -> str:
    if open_rate < 0.20:
        return "below_flag"
    if open_rate < 0.27:
        return "below_average"
    if open_rate < 0.35:
        return "average"
    if open_rate < 0.50:
        return "good"
    return "excellent"


def _assess_reply_rate(reply_rate: float) -> str:
    if reply_rate < 0.03:
        return "below_flag"
    if reply_rate < 0.05:
        return "below_average"
    if reply_rate < 0.10:
        return "average"
    if reply_rate < 0.15:
        return "good"
    return "excellent"


def classify_performance(
    open_rate: float,
    reply_rate: float,
    meeting_rate: float,
    sequence_avg_reply: float,
    step_number: int,
    max_step_number: int,
) -> dict:
    """Classify step performance into a signal class with severity and assessments."""

    is_first_touch = step_number == 1
    is_breakup_step = step_number == max_step_number

    open_rate_assessment = _assess_open_rate(open_rate)
    reply_rate_assessment = _assess_reply_rate(reply_rate)

    # Relative delta from sequence average reply rate
    if max_step_number == 1:
        relative_to_sequence_avg = None
    else:
        if sequence_avg_reply > 0:
            relative_to_sequence_avg = (
                (reply_rate - sequence_avg_reply) / sequence_avg_reply
            )
        else:
            relative_to_sequence_avg = 0.0

    # --- Signal class (evaluate TOTAL_DEGRADATION first) ---
    preliminary_signal_class = None

    # TOTAL_DEGRADATION: open < 0.15 AND reply < 0.03
    if open_rate < 0.15 and reply_rate < 0.03:
        preliminary_signal_class = "TOTAL_DEGRADATION"

    # SUBJECT_OR_DELIVERABILITY: open < 0.20 (but not TOTAL_DEGRADATION)
    elif open_rate < 0.20:
        preliminary_signal_class = "SUBJECT_OR_DELIVERABILITY"

    # BODY_COPY_PROBLEM: open >= 0.20 AND reply < 0.03
    elif open_rate >= 0.20 and reply_rate < 0.03:
        preliminary_signal_class = "BODY_COPY_PROBLEM"

    # CTA_OR_QUALIFICATION: reply >= 0.03 AND meeting < 0.005
    elif reply_rate >= 0.03 and meeting_rate < 0.005:
        preliminary_signal_class = "CTA_OR_QUALIFICATION"

    # RELATIVE_UNDERPERFORMER: reply >= 0.03 AND reply < (seq_avg * 0.6)
    elif (
        reply_rate >= 0.03
        and relative_to_sequence_avg is not None
        and reply_rate < (sequence_avg_reply * 0.6)
    ):
        preliminary_signal_class = "RELATIVE_UNDERPERFORMER"

    # --- Severity ---
    relative_delta_abs = (
        abs(relative_to_sequence_avg) if relative_to_sequence_avg is not None else 0.0
    )

    if (
        reply_rate < 0.015
        or open_rate < 0.10
        or (relative_to_sequence_avg is not None and relative_to_sequence_avg < -0.60)
    ):
        severity = "CRITICAL"
    elif (
        reply_rate < 0.03
        or open_rate < 0.20
        or (relative_to_sequence_avg is not None and relative_to_sequence_avg < -0.40)
    ):
        severity = "HIGH"
    else:
        severity = "MODERATE"

    return {
        "preliminary_signal_class": preliminary_signal_class,
        "severity": severity,
        "open_rate_assessment": open_rate_assessment,
        "reply_rate_assessment": reply_rate_assessment,
        "relative_to_sequence_avg": relative_to_sequence_avg,
        "is_breakup_step": is_breakup_step,
        "is_first_touch": is_first_touch,
    }
