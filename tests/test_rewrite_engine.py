"""Boundary tests for engine.rewrite_engine — RewriteEngine with fake DB and canned LLM."""

import json
import os
import sys
import unittest

# Ensure repo root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.rewrite_engine import RewriteEngine, RewriteResult, LLMClient


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

# Canned LLM response — valid JSON matching the expected rewrite output format
CANNED_REWRITE_JSON = json.dumps({
    "diagnosis": "Feature-led opening with buzzword density",
    "methodology_used": "Sandler pain-first",
    "rewrite_directions": ["problem_flip", "compression"],
    "suggested_subject": "Quick question about {{company}}'s pipeline",
    "suggested_body": "Hi {{first_name}},\n\nNoticed your team expanded this quarter...",
    "confidence": "HIGH",
    "explanation": "Replaced feature dump with pain-first hook",
})


class CannedLLMClient:
    """LLM client that returns a fixed response and records prompts received."""

    def __init__(self, response: str = CANNED_REWRITE_JSON):
        self._response = response
        self.calls: list[dict] = []
        self._model = "test-model"

    def generate(
        self, system_prompt: str, user_message: str, *, max_tokens: int = 1500
    ) -> str:
        self.calls.append({
            "system_prompt": system_prompt,
            "user_message": user_message,
            "max_tokens": max_tokens,
        })
        return self._response


class FakeCursor:
    """Cursor that returns canned rows for known queries."""

    def __init__(self, query_results: dict[str, list[dict]]):
        """
        Args:
            query_results: maps a query keyword to a list of row dicts.
                The keyword is matched against the SQL string (case-insensitive).
                Rows are consumed in order; fetchone pops the first, fetchall returns all.
        """
        self._results = query_results
        self._current_rows: list[dict] = []

    def execute(self, sql: str, params=None):
        sql_lower = sql.lower().strip()
        for keyword, rows in self._results.items():
            if keyword.lower() in sql_lower:
                self._current_rows = list(rows)  # copy so we can pop
                return
        self._current_rows = []

    def fetchone(self) -> dict | None:
        return self._current_rows.pop(0) if self._current_rows else None

    def fetchall(self) -> list[dict]:
        rows = self._current_rows[:]
        self._current_rows = []
        return rows


class FakeConnection:
    """Connection wrapping a FakeCursor; tracks commit and close calls."""

    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.committed = False
        self.closed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True


# ---------------------------------------------------------------------------
# Canned data rows
# ---------------------------------------------------------------------------

# Matches the SELECT from step_performance
STEP_ROW = {
    "source": "outreach",
    "sequence_id": "or_seq_001",
    "sequence_name": "CISO Cold Outbound",
    "step_id": "or_step_001_1",
    "step_number": 1,
    "step_type": "email",
    "send_volume": 150,
    "open_rate": 0.10,
    "reply_rate": 0.02,
    "meeting_rate": 0.001,
    "health_score_v2": 35.0,
    "flag_type": "underperforming",
    "flag_confidence": 0.85,
    "step_intent": "cold_intro",
    "position_expected_rate": 0.05,
    "bayesian_reply_rate": 0.025,
    "flag_reasons": "low_reply_rate",
    "pipeline_run_id": "run_001",
}

# Matches SELECT from sequence_steps
COPY_ROW = {
    "subject": "Our AI-powered platform scales seamlessly",
    "body_text": (
        "We built a best-in-class, cutting-edge platform that leverages AI "
        "to deliver scalable results for security teams. Our innovative approach "
        "seamlessly integrates with your existing tools. Click here to learn more: "
        "https://example.com/demo"
    ),
}

# Matches SELECT AVG(reply_rate)
AVG_REPLY_ROW = {"avg_reply": 0.06}

# Matches MAX(snapshot_date)
LATEST_DATE_ROW = {"d": "2026-03-28"}

# Matches persona lookup in build_context
PERSONA_ROW = {
    "persona_config_id": "pc_001",
    "name": "CISO",
    "persona_tier": "C-suite (CEO, CRO, CFO, CISO)",
    "deal_type": "enterprise",
    "vertical": "cybersecurity",
}

# Matches MAX(step_number) in build_context
MAX_STEP_ROW = {"max_step": 6}

# Matches prior subjects query in build_context
# (step 1 has no prior subjects)
NO_PRIOR_SUBJECTS: list[dict] = []

# Matches INSERT RETURNING id
INSERT_RESULT_ROW = {"id": "suggestion_uuid_001"}


def _build_query_results() -> dict[str, list[dict]]:
    """Map SQL keywords to canned rows for the full pipeline."""
    return {
        "max(snapshot_date)": [LATEST_DATE_ROW],
        "from step_performance\n            where snapshot_date": [STEP_ROW],
        "from sequence_steps": [COPY_ROW],
        "avg(reply_rate)": [AVG_REPLY_ROW],
        # build_context queries
        "from sequence_persona_map": [PERSONA_ROW],
        "max(step_number)": [MAX_STEP_ROW],
        "from sequence_steps\n        where sequence_id": NO_PRIOR_SUBJECTS,
        # INSERT
        "insert into rewrite_suggestions": [INSERT_RESULT_ROW],
    }


def _make_engine(
    llm_client=None, query_results=None
) -> tuple[RewriteEngine, FakeConnection, CannedLLMClient]:
    """Create a RewriteEngine wired to fakes."""
    qr = query_results or _build_query_results()
    cursor = FakeCursor(qr)
    conn = FakeConnection(cursor)
    llm = llm_client or CannedLLMClient()
    engine = RewriteEngine(db_factory=lambda: conn, llm_client=llm)
    return engine, conn, llm


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestClassifyOnly(unittest.TestCase):
    """classify_only with low reply rate data returns correct signal class and failure modes."""

    def test_low_reply_rate_produces_body_copy_problem(self):
        engine, conn, _ = _make_engine()
        result = engine.classify_only("or_step_001_1")

        # open=0.18 (< 0.20) + reply=0.02 (< 0.03) → TOTAL_DEGRADATION
        self.assertEqual(result["signal_class"], "TOTAL_DEGRADATION")
        self.assertIsInstance(result["failure_modes"], list)
        self.assertTrue(len(result["failure_modes"]) > 0)

        # FM3 (wrong_persona_targeting) should fire for TOTAL_DEGRADATION + CRITICAL
        fm_codes = {fm["code"] for fm in result["failure_modes"]}
        self.assertIn("fm3", fm_codes)

        # Connection should be closed
        self.assertTrue(conn.closed)

    def test_classify_only_returns_expected_keys(self):
        engine, _, _ = _make_engine()
        result = engine.classify_only("or_step_001_1")

        expected_keys = {
            "signal_class", "failure_modes", "severity",
            "routing_hints", "step_data", "context", "token_estimate",
        }
        self.assertEqual(set(result.keys()), expected_keys)

    def test_classify_only_no_pipeline_data(self):
        qr = {"max(snapshot_date)": [{"d": None}]}
        engine, _, _ = _make_engine(query_results=qr)
        result = engine.classify_only("or_step_001_1")
        self.assertIn("error", result)


class TestRewriteStoreFlag(unittest.TestCase):
    """rewrite with store=False returns RewriteResult without INSERT."""

    def test_store_false_skips_insert(self):
        engine, conn, _ = _make_engine()
        result = engine.rewrite("or_step_001_1", store=False)

        self.assertIsInstance(result, RewriteResult)
        self.assertIsNone(result.suggestion_id)
        self.assertFalse(conn.committed)
        self.assertTrue(conn.closed)

    def test_store_true_does_insert(self):
        engine, conn, _ = _make_engine()
        result = engine.rewrite("or_step_001_1", store=True)

        self.assertIsInstance(result, RewriteResult)
        self.assertEqual(result.suggestion_id, "suggestion_uuid_001")
        self.assertTrue(conn.committed)


class TestLLMPromptPassing(unittest.TestCase):
    """rewrite passes the correct system prompt to the LLM client."""

    def test_system_prompt_contains_invariant_rules_header(self):
        llm = CannedLLMClient()
        engine, _, _ = _make_engine(llm_client=llm)
        engine.rewrite("or_step_001_1", store=False)

        self.assertEqual(len(llm.calls), 1)
        system_prompt = llm.calls[0]["system_prompt"]
        # System prompt should contain the header from prompts/rewrite.py
        self.assertIn("Beacon Loop's rewrite engine", system_prompt)
        self.assertIn("invariant rules", system_prompt.lower())

    def test_user_message_contains_step_data(self):
        llm = CannedLLMClient()
        engine, _, _ = _make_engine(llm_client=llm)
        engine.rewrite("or_step_001_1", store=False)

        user_msg = llm.calls[0]["user_message"]
        self.assertIn("CISO Cold Outbound", user_msg)
        self.assertIn("10.0%", user_msg)  # open_rate formatted
        self.assertIn("2.0%", user_msg)   # reply_rate formatted


class TestFullPipelineResult(unittest.TestCase):
    """Full pipeline produces a valid RewriteResult with all expected fields."""

    def test_full_pipeline_result_fields(self):
        engine, _, _ = _make_engine()
        result = engine.rewrite("or_step_001_1", store=False)

        self.assertIsInstance(result, RewriteResult)
        self.assertIsNone(result.error)
        self.assertEqual(result.step_id, "or_step_001_1")
        self.assertEqual(result.sequence_name, "CISO Cold Outbound")
        self.assertEqual(result.step_number, 1)
        self.assertEqual(result.persona, "CISO")
        self.assertEqual(result.diagnosis, "Feature-led opening with buzzword density")
        self.assertEqual(result.methodology_used, "Sandler pain-first")
        self.assertEqual(result.rewrite_directions, ["problem_flip", "compression"])
        self.assertIn("{{company}}", result.suggested_subject)
        self.assertEqual(result.confidence, "HIGH")
        self.assertEqual(result.signal_class, "TOTAL_DEGRADATION")
        self.assertIsInstance(result.failure_modes, list)
        self.assertGreater(result.token_estimate, 0)
        self.assertEqual(result.model_used, "test-model")

    def test_canned_llm_satisfies_protocol(self):
        self.assertIsInstance(CannedLLMClient(), LLMClient)


if __name__ == "__main__":
    unittest.main()
