"""
prompts/rewrite.py
Canonical rewrite prompt for underperforming sequence steps.

Used by:
- mcp_server/server.py (get_rewrite_suggestion tool)
- dashboard/app/api/rewrites/generate (TypeScript port references this as source of truth)
"""

import json
import re
from typing import Any

import anthropic


def build_rewrite_prompt(step: dict[str, Any], persona: dict[str, Any]) -> str:
    """Build the rewrite prompt from step metrics and persona config.

    Returns the prompt string ready to send to Claude.
    """
    pain_points_str = ", ".join(persona.get("pain_points") or [])
    flag_reasons_str = (
        "\n  - ".join(step["flag_reasons"])
        if step.get("flag_reasons")
        else "health score below threshold"
    )

    return f"""You are an expert B2B sales email copywriter analyzing an underperforming outbound sequence step.

## Step Metrics
- Source: {step["source"]}
- Sequence: {step["sequence_name"]} (ID: {step["sequence_id"]})
- Step: #{step["step_number"]} ({step["step_type"]})
- Send volume: {step["send_volume"]}
- Open rate: {float(step["open_rate"]):.1%}
- Reply rate: {float(step["reply_rate"]):.1%}
- Meeting rate: {float(step["meeting_rate"]):.1%}
- Health score: {float(step.get("health_score_v2", step.get("health_score", 0))):.3f} / 1.000
- Step intent: {step.get("step_intent", "unknown")}
- Position expected rate: {f'{float(step["position_expected_rate"]):.2%}' if step.get("position_expected_rate") is not None else 'N/A'}
- Bayesian reply rate: {f'{float(step["bayesian_reply_rate"]):.2%}' if step.get("bayesian_reply_rate") is not None else 'N/A'}
- Flag type: {step.get("flag_type", "none")}

## Why It's Flagged
  - {flag_reasons_str}

## Target Persona
- Title: {persona.get("title", "unknown")}
- Industry: {persona.get("industry", "unknown")}
- Company size: {persona.get("company_size", "unknown")}
- Pain points: {pain_points_str}
- Tone: {persona.get("tone", "professional")}
{f'- Additional context: {persona["extra_context"]}' if persona.get("extra_context") else ""}

## Selling Methodology — Apply ALL Five Principles

### 1. Sell to Pain
Name the specific operational or business pain this persona experiences given their title, industry, and company stage. Do NOT pitch features. Start from their problem, not the product.

### 2. Value-Based Framing
Lead with what changes for the prospect as an outcome, not what the product does. Frame every benefit as a result they achieve.

### 3. Why You (Relevance)
Make relevance to this specific persona and company context explicit. Use the title "{persona.get("title", "unknown")}" at a {persona.get("company_size", "unknown")} {persona.get("industry", "unknown")} company to ground the copy in their world. Reference challenges specific to their role and scale.

### 4. Why Now (Timing)
Anchor to a timely reason to act. Based on the persona's industry ({persona.get("industry", "unknown")}), role ({persona.get("title", "unknown")}), and company size ({persona.get("company_size", "unknown")}), infer the most relevant timing signal — e.g. budget cycles, quarterly planning, hiring surges, regulatory deadlines, competitive pressure, or seasonal patterns.

### 5. Anti-Template Test
If the subject line or opening line could apply to 1,000 companies without changing a word, it fails. Rewrite until it can't. Every line must feel written for THIS persona at THIS type of company.

## Your Task
Respond with a JSON object containing exactly these five keys:

1. "diagnosis": 2-3 sentences explaining why this step is underperforming based on the metrics and persona fit. Be specific about which selling principle the current copy violates.

2. "suggested_subject": A single revised subject line optimized for this persona. Must pass the anti-template test.

3. "suggested_body": A revised email body (plain text, 3-5 sentences, no placeholders except {{{{first_name}}}} and {{{{company}}}}). Must lead with pain, frame value as outcomes, and include a timing hook.

4. "confidence": One of "low", "medium", or "high". Base this on how much data you have to work with — "high" when metrics clearly point to a fixable issue and the persona context is rich, "low" when data is sparse or the problem is ambiguous.

5. "explanation": Plain English written for a manager. Explain what changed between the original and the rewrite, which selling principle drove each specific change, and why it should perform better. No jargon. Example tone: "The original subject line gives a CISO no reason to open it. The rewrite leads with a board-level compliance pressure that's top of mind right now, which is why it's more likely to get opened."

Respond with raw JSON only — no markdown fences."""


def generate_rewrite(
    step: dict[str, Any],
    persona: dict[str, Any],
    api_key: str,
) -> dict[str, str]:
    """Call Claude with the rewrite prompt and return parsed result.

    Returns dict with keys: diagnosis, suggested_subject, suggested_body,
    confidence, explanation.
    """
    prompt = build_rewrite_prompt(step, persona)

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(match.group()) if match else {"raw_response": raw}

    return {
        "diagnosis": parsed.get("diagnosis", ""),
        "suggested_subject": parsed.get("suggested_subject", ""),
        "suggested_body": parsed.get("suggested_body", ""),
        "confidence": parsed.get("confidence", "medium"),
        "explanation": parsed.get("explanation", ""),
    }
