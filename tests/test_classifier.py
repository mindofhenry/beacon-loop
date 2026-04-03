"""Unit tests for the classifier package — 10 test cases."""

import unittest
import sys
import os

# Ensure repo root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from classifier.performance import classify_performance
from classifier.copy_analysis import analyze_copy
from classifier.post_classify import post_classify


class TestPerformanceClassifier(unittest.TestCase):
    """Tests 1-4: classify_performance."""

    def test_total_degradation_precedence(self):
        """Test 1: TOTAL_DEGRADATION takes precedence over SUBJECT_OR_DELIVERABILITY."""
        result = classify_performance(
            open_rate=0.10,
            reply_rate=0.01,
            meeting_rate=0.001,
            sequence_avg_reply=0.05,
            step_number=2,
            max_step_number=6,
        )
        self.assertEqual(result["preliminary_signal_class"], "TOTAL_DEGRADATION")
        self.assertEqual(result["severity"], "CRITICAL")

    def test_body_copy_problem(self):
        """Test 2: BODY_COPY_PROBLEM classification."""
        result = classify_performance(
            open_rate=0.35,
            reply_rate=0.02,
            meeting_rate=0.005,
            sequence_avg_reply=0.05,
            step_number=1,
            max_step_number=6,
        )
        self.assertEqual(result["preliminary_signal_class"], "BODY_COPY_PROBLEM")
        self.assertTrue(result["is_first_touch"])

    def test_breakup_step_flag(self):
        """Test 3: Breakup step flag."""
        result = classify_performance(
            open_rate=0.30,
            reply_rate=0.04,
            meeting_rate=0.008,
            sequence_avg_reply=0.05,
            step_number=6,
            max_step_number=6,
        )
        self.assertTrue(result["is_breakup_step"])

    def test_single_step_sequence(self):
        """Test 4: Single-step sequence edge case."""
        result = classify_performance(
            open_rate=0.25,
            reply_rate=0.04,
            meeting_rate=0.01,
            sequence_avg_reply=0.04,
            step_number=1,
            max_step_number=1,
        )
        self.assertIsNone(result["relative_to_sequence_avg"])


class TestCopyAnalysis(unittest.TestCase):
    """Tests 5-6: analyze_copy."""

    def test_none_inputs(self):
        """Test 5: copy_analysis with None inputs."""
        result = analyze_copy(
            subject=None,
            body_text=None,
            step_number=1,
            max_step_number=6,
        )
        self.assertFalse(result["copy_available"])
        self.assertIsNone(result["word_count"])
        self.assertIsNone(result["subject_word_count"])
        self.assertIsNone(result["sentence_count"])
        self.assertIsNone(result["paragraph_count"])
        self.assertIsNone(result["max_paragraph_sentences"])
        self.assertIsNone(result["question_count"])
        self.assertIsNone(result["starts_with_we_or_our"])
        self.assertIsNone(result["i_we_sentence_ratio"])
        self.assertIsNone(result["has_multiple_questions"])
        self.assertIsNone(result["has_multiple_links"])
        self.assertIsNone(result["subject_word_count_flag"])
        self.assertIsNone(result["body_word_count_flag"])
        self.assertIsNone(result["body_word_count_soft_flag"])
        self.assertIsNone(result["detected_buzzwords"])
        self.assertIsNone(result["has_template_variables"])

    def test_fm1_buzzwords(self):
        """Test 6: FM1 detection via buzzwords."""
        result = analyze_copy(
            subject="Quick question",
            body_text="Our AI-powered platform is scalable and cutting-edge.",
            step_number=1,
            max_step_number=6,
        )
        self.assertGreaterEqual(len(result["detected_buzzwords"]), 3)
        self.assertTrue(result["starts_with_we_or_our"])


class TestPostClassify(unittest.TestCase):
    """Test 7: post_classify FM9 detection."""

    def test_fm9_breakup_no_questions(self):
        """Test 7: FM9 detection on breakup step."""
        perf = {
            "preliminary_signal_class": "CTA_OR_QUALIFICATION",
            "severity": "MODERATE",
            "open_rate_assessment": "average",
            "reply_rate_assessment": "below_average",
            "relative_to_sequence_avg": -0.10,
            "is_breakup_step": True,
            "is_first_touch": False,
        }
        copy = {
            "word_count": 50,
            "subject_word_count": 3,
            "sentence_count": 3,
            "paragraph_count": 1,
            "max_paragraph_sentences": 3,
            "question_count": 0,
            "starts_with_we_or_our": False,
            "i_we_sentence_ratio": 0.0,
            "has_multiple_questions": False,
            "has_multiple_links": False,
            "subject_word_count_flag": False,
            "body_word_count_flag": False,
            "body_word_count_soft_flag": False,
            "detected_buzzwords": [],
            "has_template_variables": False,
            "copy_available": True,
        }
        context = {
            "persona_tier": None,
            "deal_type": None,
            "vertical": None,
            "sequence_stage": "breakup",
        }
        result = post_classify(perf, copy, context)
        fm_codes = [fm["code"] for fm in result["detected_failure_modes"]]
        self.assertIn("fm9", fm_codes)


class TestRouter(unittest.TestCase):
    """Tests 8-10: classifier.router.route()."""

    def setUp(self):
        from classifier.router import route
        self.route = route

    def test_always_includes_part1_and_part10(self):
        """Test 8: Router includes part_1 and part_10 always."""
        classifier_output = {
            "final_signal_class": "BODY_COPY_PROBLEM",
            "detected_failure_modes": [],
            "severity": "MODERATE",
            "routing_hints": ["part_1_invariant_rules", "part_3_methodology"],
        }
        context = {
            "persona_tier": "VP / Director",
            "deal_type": "Mid-market",
            "vertical": None,
            "sequence_stage": "follow_up",
            "persona_name": "vp_director",
        }
        result = self.route(classifier_output, context)
        section_keys = [s["key"] for s in result["system_prompt_sections"]]
        self.assertIn("part_1_invariant_rules", section_keys)
        self.assertIn("part_10_output_format", section_keys)

    def test_full_fallback_includes_all_fm_keys(self):
        """Test 9: Full fallback includes all 10 FM keys."""
        classifier_output = {
            "final_signal_class": "NONE_DETECTED",
            "detected_failure_modes": [],
            "severity": "LOW",
            "routing_hints": [
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
            ],
        }
        context = {
            "persona_tier": None,
            "deal_type": None,
            "vertical": None,
            "sequence_stage": "follow_up",
            "persona_name": None,
        }
        result = self.route(classifier_output, context)
        self.assertTrue(result["is_full_fallback"])
        # Find the part_2 section and check all 10 FM keys are present
        part2 = None
        for s in result["system_prompt_sections"]:
            if s["key"] == "part_2_failure_modes":
                part2 = s
                break
        self.assertIsNotNone(part2, "part_2_failure_modes section missing")
        import json
        part2_data = json.loads(part2["content"])
        expected_fm_keys = [
            "fm1_feature_led_opening", "fm2_fake_personalization",
            "fm3_wrong_persona_targeting", "fm4_cta_overload",
            "fm5_too_long_too_dense", "fm6_too_vague_too_safe",
            "fm7_methodology_mismatch", "fm8_buying_stage_mismatch",
            "fm9_breakup_without_tension", "fm10_subject_body_misalignment",
        ]
        for fm_key in expected_fm_keys:
            self.assertIn(fm_key, part2_data, f"Missing FM key: {fm_key}")

    def test_vertical_conditional_inclusion(self):
        """Test 10: Vertical section included only when vertical is set."""
        base_classifier = {
            "final_signal_class": "BODY_COPY_PROBLEM",
            "detected_failure_modes": [],
            "severity": "MODERATE",
            "routing_hints": ["part_1_invariant_rules", "part_3_methodology"],
        }
        context_with_vertical = {
            "persona_tier": None,
            "deal_type": None,
            "vertical": "security_saas",
            "sequence_stage": "follow_up",
            "persona_name": None,
        }
        context_no_vertical = {
            "persona_tier": None,
            "deal_type": None,
            "vertical": None,
            "sequence_stage": "follow_up",
            "persona_name": None,
        }

        result_with = self.route(base_classifier, context_with_vertical)
        keys_with = [s["key"] for s in result_with["system_prompt_sections"]]
        self.assertIn("part_6_verticals", keys_with)

        result_without = self.route(base_classifier, context_no_vertical)
        keys_without = [s["key"] for s in result_without["system_prompt_sections"]]
        self.assertNotIn("part_6_verticals", keys_without)


    def test_persona_ciso_resolves_to_part5(self):
        """Test 11: Persona 'CISO' resolves to Part 5 section via mapping."""
        classifier_output = {
            "final_signal_class": "BODY_COPY_PROBLEM",
            "detected_failure_modes": [],
            "severity": "MODERATE",
            "routing_hints": ["part_1_invariant_rules", "part_3_methodology"],
        }
        context = {
            "persona_tier": "C-suite",
            "deal_type": "Enterprise",
            "vertical": None,
            "sequence_stage": "first_touch",
            "persona_name": "CISO",
        }
        result = self.route(classifier_output, context)
        section_keys = [s["key"] for s in result["system_prompt_sections"]]
        self.assertIn("part_5_personas", section_keys)
        # Verify the content contains the ciso_security entry
        part5 = next(s for s in result["system_prompt_sections"] if s["key"] == "part_5_personas")
        self.assertTrue(
            "ciso_security" in part5["content"] or "CISO / Security Buyer" in part5["content"],
            "Part 5 content should contain ciso_security key or CISO / Security Buyer title",
        )

    def test_fm1_produces_part4_routing_hint(self):
        """Test 12: FM1 detection produces Part 4 routing hint."""
        perf = {
            "preliminary_signal_class": "BODY_COPY_PROBLEM",
            "severity": "MODERATE",
            "open_rate_assessment": "average",
            "reply_rate_assessment": "below_average",
            "relative_to_sequence_avg": -0.20,
            "is_breakup_step": False,
            "is_first_touch": True,
        }
        copy = {
            "word_count": 80,
            "subject_word_count": 3,
            "sentence_count": 5,
            "paragraph_count": 2,
            "max_paragraph_sentences": 3,
            "question_count": 0,
            "starts_with_we_or_our": True,
            "i_we_sentence_ratio": 0.4,
            "has_multiple_questions": False,
            "has_multiple_links": False,
            "subject_word_count_flag": False,
            "body_word_count_flag": False,
            "body_word_count_soft_flag": True,
            "detected_buzzwords": [],
            "has_template_variables": False,
            "copy_available": True,
        }
        context = {
            "persona_tier": None,
            "deal_type": None,
            "vertical": None,
            "sequence_stage": "first_touch",
        }
        result = post_classify(perf, copy, context)
        fm_codes = [fm["code"] for fm in result["detected_failure_modes"]]
        self.assertIn("fm1", fm_codes)
        self.assertIn("part_4_rewrite_directions.problem_flip", result["routing_hints"])

    def test_vp_director_tier_matches_methodology_rows(self):
        """Test 13: VP/Director tier matches 'VP / Director' methodology rows."""
        classifier_output = {
            "final_signal_class": "RELATIVE_UNDERPERFORMER",
            "detected_failure_modes": [{"code": "fm7", "name": "methodology_mismatch", "confidence": "confirmed", "rationale": "test"}],
            "severity": "MODERATE",
            "routing_hints": [
                "part_1_invariant_rules",
                "part_2_failure_modes.fm7_methodology_mismatch",
                "part_3_methodology",
            ],
        }
        context = {
            "persona_tier": "VP/Director",
            "deal_type": "mid-market",
            "vertical": None,
            "sequence_stage": "follow_up",
            "persona_name": None,
        }
        result = self.route(classifier_output, context)
        section_keys = [s["key"] for s in result["system_prompt_sections"]]
        self.assertIn("part_3_methodology", section_keys)
        # Parse the methodology content and check filtering occurred
        import json as _json
        part3 = next(s for s in result["system_prompt_sections"] if s["key"] == "part_3_methodology")
        part3_data = _json.loads(part3["content"])
        row_count = len(part3_data["primary_matrix"])
        self.assertLess(row_count, 14, "Should filter rows, not include all 14")
        # All matched rows should contain VP/Director in persona_tier
        for row in part3_data["primary_matrix"]:
            tier_norm = row["persona_tier"].replace(" ", "").lower()
            self.assertIn("vp/director", tier_norm.replace(" ", ""))


if __name__ == "__main__":
    unittest.main()
