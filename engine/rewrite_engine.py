"""
engine/rewrite_engine.py
RewriteEngine — testable orchestration for step diagnosis and Claude-powered rewrites.

Replaces the inline orchestration in mcp_server/server.py's get_rewrite_suggestion.
Imports classifier modules as-is; abstracts the LLM call behind LLMClient Protocol.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import anthropic

from classifier.performance import classify_performance
from classifier.copy_analysis import analyze_copy
from classifier.post_classify import post_classify
from classifier.router import route
from classifier.context_lookup import build_context
from prompts.rewrite import build_system_prompt, build_user_message

# ---------------------------------------------------------------------------
# LLMClient Protocol
# ---------------------------------------------------------------------------

REWRITE_MODEL = os.environ.get("REWRITE_MODEL", "claude-sonnet-4-6")


@runtime_checkable
class LLMClient(Protocol):
    """Minimal port for LLM text generation."""

    def generate(
        self, system_prompt: str, user_message: str, *, max_tokens: int = 1500
    ) -> str: ...


# ---------------------------------------------------------------------------
# Production LLM client
# ---------------------------------------------------------------------------


class AnthropicLLMClient:
    """Wraps the Anthropic SDK for production use."""

    def __init__(self, *, api_key: str | None = None, model: str = REWRITE_MODEL):
        self._client = anthropic.Anthropic(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY")
        )
        self._model = model

    def generate(
        self, system_prompt: str, user_message: str, *, max_tokens: int = 1500
    ) -> str:
        message = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return message.content[0].text.strip()


# ---------------------------------------------------------------------------
# RewriteResult dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RewriteResult:
    """Output of a full rewrite pipeline run."""

    suggestion_id: str | None
    step_id: str
    sequence_name: str
    step_number: int
    persona: str
    diagnosis: str
    methodology_used: str
    rewrite_directions: list[str]
    suggested_subject: str
    suggested_body: str
    confidence: str
    explanation: str
    signal_class: str
    failure_modes: list[dict[str, str]]
    token_estimate: int
    model_used: str
    error: str | None = None


# ---------------------------------------------------------------------------
# RewriteEngine
# ---------------------------------------------------------------------------


class RewriteEngine:
    """Orchestrates step diagnosis and Claude-powered rewrites.

    Args:
        db_factory: callable returning a psycopg2-compatible connection
            (must use RealDictCursor or equivalent).
        llm_client: LLMClient implementation. Defaults to AnthropicLLMClient.
        knowledge_base: optional dict override — currently unused since
            classifier.router reads its own module-level KNOWLEDGE_BASE.
    """

    def __init__(
        self,
        *,
        db_factory: Any,
        llm_client: LLMClient | None = None,
        knowledge_base: dict | None = None,
    ):
        self._db_factory = db_factory
        self._llm = llm_client or AnthropicLLMClient()
        self._knowledge_base = knowledge_base

    # -- Public API ---------------------------------------------------------

    def rewrite(
        self,
        step_id: str,
        *,
        persona_config_id: str | None = None,
        store: bool = True,
    ) -> RewriteResult:
        """Run the full pipeline: fetch → classify → route → rewrite → store.

        Args:
            step_id: the step to diagnose and rewrite.
            persona_config_id: optional override for persona resolution.
            store: if False, skip the INSERT into rewrite_suggestions.

        Returns:
            RewriteResult with all diagnostic and rewrite fields populated.
        """
        conn = self._db_factory()
        try:
            cur = conn.cursor()

            # 1. Latest pipeline run date
            latest = self._latest_run_date(cur)
            if not latest:
                return self._error_result(step_id, "No pipeline data found")

            # 2. Fetch step metrics
            step = self._fetch_step(cur, latest, step_id)
            if step is None:
                return self._error_result(
                    step_id, f"No step found with step_id={step_id!r} in latest run"
                )

            # 3. Fetch step copy
            subject, body_text = self._fetch_copy(cur, step_id)

            # 4. Build context
            context = build_context(
                step_row=step,
                sequence_id=step["sequence_id"],
                source=step["source"],
                step_number=step["step_number"],
                db_cursor=cur,
                latest_date=latest,
            )

            # 5. Sequence average reply rate
            seq_avg_reply = self._fetch_seq_avg_reply(
                cur, step["sequence_id"], step["source"], latest
            )

            # 6. Classification pipeline
            classifier_output = self._classify(
                step, subject, body_text, context, seq_avg_reply
            )

            # 7. Route to knowledge base sections
            routed = route(classifier_output, context)

            # 8. Build prompts and call LLM
            step_data = self._build_step_data(step, subject, body_text, context)
            system_prompt = build_system_prompt(routed)
            user_message = build_user_message(step_data, classifier_output, context)
            raw = self._llm.generate(system_prompt, user_message)
            result = self._parse_llm_response(raw)

            # 9. Persist if requested
            suggestion_id = None
            if store:
                stored_persona_id = context.get("persona_config_id")
                if not stored_persona_id and persona_config_id:
                    stored_persona_id = persona_config_id

                suggestion_id = self._store(
                    cur, step, subject, body_text, result,
                    classifier_output, stored_persona_id,
                )
                conn.commit()

            return RewriteResult(
                suggestion_id=str(suggestion_id) if suggestion_id else None,
                step_id=step["step_id"],
                sequence_name=step["sequence_name"],
                step_number=step["step_number"],
                persona=context["persona_name"],
                diagnosis=result.get("diagnosis", ""),
                methodology_used=result.get("methodology_used", ""),
                rewrite_directions=result.get("rewrite_directions", []),
                suggested_subject=result.get("suggested_subject", ""),
                suggested_body=result.get("suggested_body", ""),
                confidence=result.get("confidence", "MEDIUM"),
                explanation=result.get("explanation", ""),
                signal_class=classifier_output["final_signal_class"],
                failure_modes=classifier_output["detected_failure_modes"],
                token_estimate=routed.get("token_estimate", 0),
                model_used=self._llm._model if hasattr(self._llm, "_model") else REWRITE_MODEL,
            )
        finally:
            conn.close()

    def classify_only(self, step_id: str) -> dict:
        """Run diagnosis without LLM call or storage.

        Returns:
            dict with keys: signal_class, failure_modes, severity,
            routing_hints, step_data, context, token_estimate.
        """
        conn = self._db_factory()
        try:
            cur = conn.cursor()

            latest = self._latest_run_date(cur)
            if not latest:
                return {"error": "No pipeline data found"}

            step = self._fetch_step(cur, latest, step_id)
            if step is None:
                return {"error": f"No step found with step_id={step_id!r} in latest run"}

            subject, body_text = self._fetch_copy(cur, step_id)

            context = build_context(
                step_row=step,
                sequence_id=step["sequence_id"],
                source=step["source"],
                step_number=step["step_number"],
                db_cursor=cur,
                latest_date=latest,
            )

            seq_avg_reply = self._fetch_seq_avg_reply(
                cur, step["sequence_id"], step["source"], latest
            )

            classifier_output = self._classify(
                step, subject, body_text, context, seq_avg_reply
            )

            routed = route(classifier_output, context)

            return {
                "signal_class": classifier_output["final_signal_class"],
                "failure_modes": classifier_output["detected_failure_modes"],
                "severity": classifier_output["severity"],
                "routing_hints": classifier_output.get("routing_hints", []),
                "step_data": self._build_step_data(step, subject, body_text, context),
                "context": context,
                "token_estimate": routed.get("token_estimate", 0),
            }
        finally:
            conn.close()

    # -- Private helpers ----------------------------------------------------

    @staticmethod
    def _latest_run_date(cur) -> str | None:
        cur.execute("SELECT MAX(snapshot_date) AS d FROM step_performance")
        row = cur.fetchone()
        return row["d"] if row else None

    @staticmethod
    def _fetch_step(cur, latest, step_id: str) -> dict | None:
        cur.execute(
            """
            SELECT source, sequence_id, sequence_name, step_id, step_number,
                   step_type, send_volume, open_rate, reply_rate, meeting_rate,
                   health_score_v2, flag_type, flag_confidence,
                   step_intent, position_expected_rate, bayesian_reply_rate,
                   flag_reasons, pipeline_run_id
            FROM step_performance
            WHERE snapshot_date = %s AND step_id = %s
            LIMIT 1
            """,
            (latest, step_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    @staticmethod
    def _fetch_copy(cur, step_id: str) -> tuple[str | None, str | None]:
        cur.execute(
            "SELECT subject, body_text FROM sequence_steps WHERE step_id = %s LIMIT 1",
            (step_id,),
        )
        row = cur.fetchone()
        if row:
            return row["subject"], row["body_text"]
        return None, None

    @staticmethod
    def _fetch_seq_avg_reply(cur, sequence_id, source, latest) -> float:
        cur.execute(
            """
            SELECT AVG(reply_rate) AS avg_reply
            FROM step_performance
            WHERE sequence_id = %s AND source = %s AND snapshot_date = %s
            """,
            (sequence_id, source, latest),
        )
        row = cur.fetchone()
        return float(row["avg_reply"]) if row and row["avg_reply"] else 0.0

    @staticmethod
    def _classify(step, subject, body_text, context, seq_avg_reply) -> dict:
        perf_result = classify_performance(
            open_rate=float(step["open_rate"]),
            reply_rate=float(step["reply_rate"]),
            meeting_rate=float(step["meeting_rate"]),
            sequence_avg_reply=seq_avg_reply,
            step_number=step["step_number"],
            max_step_number=context["max_step_number"],
        )
        copy_result = analyze_copy(
            subject=subject,
            body_text=body_text,
            step_number=step["step_number"],
            max_step_number=context["max_step_number"],
        )
        return post_classify(perf_result, copy_result, context)

    @staticmethod
    def _build_step_data(step, subject, body_text, context) -> dict:
        return {
            "step_id": step["step_id"],
            "sequence_name": step["sequence_name"],
            "step_number": step["step_number"],
            "max_step_number": context["max_step_number"],
            "open_rate": float(step["open_rate"]),
            "reply_rate": float(step["reply_rate"]),
            "meeting_rate": float(step["meeting_rate"]),
            "subject": subject,
            "body_text": body_text,
        }

    @staticmethod
    def _parse_llm_response(raw: str) -> dict:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
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
        }

    @staticmethod
    def _store(cur, step, subject, body_text, result, classifier_output, persona_config_id) -> str:
        cur.execute(
            """
            INSERT INTO rewrite_suggestions
                (step_id, sequence_id, sequence_name, step_number,
                 persona_config_id, diagnosis, suggested_subject, suggested_body,
                 confidence, explanation, model_used, pipeline_run_id,
                 failure_modes_detected, methodology_used, rewrite_directions,
                 signal_class, step_copy_snapshot)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                step["step_id"],
                step["sequence_id"],
                step["sequence_name"],
                step["step_number"],
                persona_config_id,
                result.get("diagnosis"),
                result.get("suggested_subject"),
                result.get("suggested_body"),
                result.get("confidence"),
                result.get("explanation"),
                result.get("model_used", REWRITE_MODEL),
                step["pipeline_run_id"],
                json.dumps(classifier_output["detected_failure_modes"]),
                result.get("methodology_used"),
                json.dumps(result.get("rewrite_directions", [])),
                classifier_output["final_signal_class"],
                json.dumps({"subject": subject, "body": body_text}),
            ),
        )
        return cur.fetchone()["id"]

    @staticmethod
    def _error_result(step_id: str, message: str) -> RewriteResult:
        return RewriteResult(
            suggestion_id=None,
            step_id=step_id,
            sequence_name="",
            step_number=0,
            persona="",
            diagnosis="",
            methodology_used="",
            rewrite_directions=[],
            suggested_subject="",
            suggested_body="",
            confidence="",
            explanation="",
            signal_class="",
            failure_modes=[],
            token_estimate=0,
            model_used=REWRITE_MODEL,
            error=message,
        )
