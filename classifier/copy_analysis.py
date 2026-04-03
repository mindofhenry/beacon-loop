"""Stage 2: Copy-based heuristic analysis."""

import re

BUZZWORDS = [
    "ai-powered",
    "scalable",
    "platform",
    "cutting-edge",
    "innovative",
    "synergy",
    "leverage",
    "seamlessly",
    "best-in-class",
    "world-class",
]


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences on . ! ? boundaries."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s for s in parts if s.strip()]


def _split_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs on double newlines."""
    paras = re.split(r'\n\s*\n', text.strip())
    return [p for p in paras if p.strip()]


def analyze_copy(
    subject: str | None,
    body_text: str | None,
    step_number: int,
    max_step_number: int,
) -> dict:
    """Analyze email copy for structural and stylistic signals."""

    if subject is None and body_text is None:
        return {
            "word_count": None,
            "subject_word_count": None,
            "sentence_count": None,
            "paragraph_count": None,
            "max_paragraph_sentences": None,
            "question_count": None,
            "starts_with_we_or_our": None,
            "i_we_sentence_ratio": None,
            "has_multiple_questions": None,
            "has_multiple_links": None,
            "subject_word_count_flag": None,
            "body_word_count_flag": None,
            "body_word_count_soft_flag": None,
            "detected_buzzwords": None,
            "has_template_variables": None,
            "copy_available": False,
        }

    # Subject analysis
    if subject is not None:
        subject_word_count = len(subject.split())
    else:
        subject_word_count = None

    # Body analysis
    if body_text is not None:
        words = body_text.split()
        word_count = len(words)

        sentences = _split_sentences(body_text)
        sentence_count = len(sentences)

        paragraphs = _split_paragraphs(body_text)
        paragraph_count = len(paragraphs)

        # Max sentences in any single paragraph
        max_paragraph_sentences = 0
        for para in paragraphs:
            para_sentences = _split_sentences(para)
            if len(para_sentences) > max_paragraph_sentences:
                max_paragraph_sentences = len(para_sentences)

        # Questions
        question_count = sum(1 for s in sentences if s.strip().endswith("?"))

        # First word check
        first_word = words[0].strip().lower() if words else ""
        starts_with_we_or_our = first_word in ("we", "our")

        # I/We sentence ratio
        i_we_count = 0
        for s in sentences:
            first_token = s.strip().split()[0].lower() if s.strip().split() else ""
            if first_token in ("i", "we"):
                i_we_count += 1
        i_we_sentence_ratio = i_we_count / sentence_count if sentence_count > 0 else 0.0

        # Links
        link_count = len(re.findall(r'https?://', body_text))
        has_multiple_links = link_count > 1

        # Buzzwords
        body_lower = body_text.lower()
        detected_buzzwords = [bw for bw in BUZZWORDS if bw in body_lower]

        # Template variables
        has_template_variables = bool(re.search(r'\{\{?', body_text))

    else:
        word_count = 0
        sentence_count = 0
        paragraph_count = 0
        max_paragraph_sentences = 0
        question_count = 0
        starts_with_we_or_our = False
        i_we_sentence_ratio = 0.0
        has_multiple_links = False
        detected_buzzwords = []
        has_template_variables = False

    return {
        "word_count": word_count,
        "subject_word_count": subject_word_count,
        "sentence_count": sentence_count,
        "paragraph_count": paragraph_count,
        "max_paragraph_sentences": max_paragraph_sentences,
        "question_count": question_count,
        "starts_with_we_or_our": starts_with_we_or_our,
        "i_we_sentence_ratio": i_we_sentence_ratio,
        "has_multiple_questions": question_count > 1,
        "has_multiple_links": has_multiple_links,
        "subject_word_count_flag": subject_word_count > 7 if subject_word_count is not None else None,
        "body_word_count_flag": word_count > 100,
        "body_word_count_soft_flag": word_count > 75,
        "detected_buzzwords": detected_buzzwords,
        "has_template_variables": has_template_variables,
        "copy_available": True,
    }
