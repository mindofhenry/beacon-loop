"""
prompts/rewrite.py
Rewrite prompt assembly and Claude API call for underperforming sequence steps.

Used by:
- mcp_server/server.py (get_rewrite_suggestion tool)
- dashboard/app/api/rewrites/generate (TypeScript port references this as source of truth)
"""

import json
import os
import re
from typing import Any

import anthropic

REWRITE_MODEL = os.environ.get("REWRITE_MODEL", "claude-sonnet-4-6")

_SYSTEM_HEADER = """You are Beacon Loop's rewrite engine. Your role is to diagnose underperforming sales email steps and produce methodology-grounded, persona-aware rewrites.

Apply the invariant rules, failure mode framework, methodology selection matrix, and persona guidance below. Every rewrite must comply with Part 1 rules before any other optimization is applied."""


def build_system_prompt(routed: dict) -> str:
    """Build the full system prompt from routed knowledge base sections.

    Args:
        routed: dict returned by classifier.router.route()

    Returns:
        Single string — the system prompt for the Claude API call.
    """
    section_contents = [s["content"] for s in routed["system_prompt_sections"]]
    return _SYSTEM_HEADER + "\n\n" + "\n\n".join(section_contents)


def build_user_message(
    step_data: dict,
    classifier_output: dict,
    context: dict,
) -> str:
    """Build the structured user message for the rewrite request.

    Args:
        step_data: dict with step_id, sequence_name, step_number, max_step_number,
            open_rate, reply_rate, meeting_rate, subject, body_text
        classifier_output: dict from post_classify()
        context: dict with persona_name, deal_type, vertical, sequence_stage

    Returns:
        Structured string (not JSON) for the user message.
    """
    # Performance assessments from classifier
    severity = classifier_output.get("severity", "LOW")
    final_signal_class = classifier_output.get("final_signal_class", "NONE_DETECTED")

    # Rate assessments — derive from classifier or compute simple labels
    open_rate = step_data.get("open_rate", 0)
    reply_rate = step_data.get("reply_rate", 0)
    open_rate_assessment = _assess_rate("open", open_rate)
    reply_rate_assessment = _assess_rate("reply", reply_rate)

    # Failure modes section
    fms = classifier_output.get("detected_failure_modes", [])
    if fms:
        fm_lines = "\n".join(
            f"- {fm['code']}: {fm['name']} ({fm['confidence']}) — {fm['rationale']}"
            for fm in fms
        )
    else:
        fm_lines = "- None detected via heuristics — perform your own diagnosis"

    subject = step_data.get("subject") or "No subject available"
    body_text = step_data.get("body_text") or "No body text available"
    vertical = context.get("vertical") or "unspecified"

    return f"""## Step Being Analyzed
Sequence: {step_data.get("sequence_name", "unknown")}
Step: {step_data.get("step_number", "?")} of {step_data.get("max_step_number", "?")} ({context.get("sequence_stage", "unknown")})
Persona: {context.get("persona_name", "unknown")} | Deal type: {context.get("deal_type", "unknown")} | Vertical: {vertical}

## Performance Data
Open rate: {open_rate:.1%} ({open_rate_assessment})
Reply rate: {reply_rate:.1%} ({reply_rate_assessment})
Meeting rate: {step_data.get("meeting_rate", 0):.1%}
Severity: {severity}
Signal class: {final_signal_class}

## Detected Failure Modes
{fm_lines}

## Current Step Copy
Subject: {subject}
Body:
{body_text}

## Required Output Format
Respond with a JSON object containing exactly these keys:
- "diagnosis": string — which failure mode(s) you diagnosed and why, grounded in the copy and performance data
- "methodology_used": string — which methodology governs this rewrite and why
- "rewrite_directions": array of strings — the named directions from Part 4 you applied
- "suggested_subject": string — rewritten subject line
- "suggested_body": string — rewritten email body. Preserve any template variables ({{first_name}}, {{{{company}}}}, etc.) exactly as they appear.
- "confidence": string — "HIGH", "MEDIUM", or "LOW"
- "explanation": string — diff-style explanation of every major change made and why"""


def generate_rewrite(
    step_data: dict,
    classifier_output: dict,
    context: dict,
    routed: dict,
) -> dict[str, Any]:
    """Call Claude with the assembled system + user prompt and return parsed result.

    Args:
        step_data: dict with step metrics and copy
        classifier_output: dict from post_classify()
        context: dict with persona_name, deal_type, vertical, sequence_stage
        routed: dict from classifier.router.route()

    Returns:
        dict with 7 output keys plus model_used, token_estimate, routing_log.
        On parse failure: dict with error=True, raw_response, and other keys as None.
    """
    system_prompt = build_system_prompt(routed)
    user_message = build_user_message(step_data, classifier_output, context)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=REWRITE_MODEL,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = message.content[0].text.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Strip markdown fences if present
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group())
            except json.JSONDecodeError:
                parsed = None
        else:
            parsed = None

    if parsed is None:
        return {
            "error": True,
            "raw_response": raw,
            "diagnosis": None,
            "methodology_used": None,
            "rewrite_directions": None,
            "suggested_subject": None,
            "suggested_body": None,
            "confidence": None,
            "explanation": None,
            "model_used": REWRITE_MODEL,
            "token_estimate": routed.get("token_estimate"),
            "routing_log": routed.get("routing_log"),
        }

    return {
        "diagnosis": parsed.get("diagnosis", ""),
        "methodology_used": parsed.get("methodology_used", ""),
        "rewrite_directions": parsed.get("rewrite_directions", []),
        "suggested_subject": parsed.get("suggested_subject", ""),
        "suggested_body": parsed.get("suggested_body", ""),
        "confidence": parsed.get("confidence", "MEDIUM"),
        "explanation": parsed.get("explanation", ""),
        "model_used": REWRITE_MODEL,
        "token_estimate": routed.get("token_estimate"),
        "routing_log": routed.get("routing_log"),
    }


def _assess_rate(metric: str, rate: float) -> str:
    """Simple rate assessment label based on absolute benchmarks."""
    if metric == "open":
        if rate >= 0.50:
            return "excellent"
        if rate >= 0.35:
            return "good"
        if rate >= 0.27:
            return "average"
        if rate >= 0.20:
            return "below_average"
        return "below_flag"
    if metric == "reply":
        if rate >= 0.10:
            return "excellent"
        if rate >= 0.05:
            return "good"
        if rate >= 0.03:
            return "average"
        if rate >= 0.015:
            return "below_average"
        return "below_flag"
    return "unknown"
