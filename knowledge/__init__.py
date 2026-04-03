"""knowledge — lazy-loaded messaging intelligence knowledge base."""

import json
from pathlib import Path

_knowledge_base = None


def get_knowledge_base() -> dict:
    """Return the cached knowledge base, loading from disk on first call."""
    global _knowledge_base
    if _knowledge_base is None:
        kb_path = Path(__file__).resolve().parent / "beacon_messaging_intelligence.json"
        with open(kb_path, "r", encoding="utf-8") as f:
            _knowledge_base = json.load(f)
    return _knowledge_base
