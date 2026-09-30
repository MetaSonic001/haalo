"""Pure scoring helpers (no network): unit-tested in tests/test_evals.py."""

from __future__ import annotations

import re
import unicodedata

SCRIPT_RANGES = {
    "Devanagari": (0x0900, 0x097F),
    "Gujarati": (0x0A80, 0x0AFF),
    "Tamil": (0x0B80, 0x0BFF),
    "Telugu": (0x0C00, 0x0C7F),
    "Kannada": (0x0C80, 0x0CFF),
    "Bengali": (0x0980, 0x09FF),
    "Malayalam": (0x0D00, 0x0D7F),
    "Gurmukhi": (0x0A00, 0x0A7F),
}


def script_ratio(text: str, script: str) -> float:
    """Share of letters written in `script` (Latin = ASCII letters). Ignores digits/punctuation."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    if script == "Latin":
        return sum(1 for c in letters if c.isascii()) / len(letters)
    lo, hi = SCRIPT_RANGES[script]
    return sum(1 for c in letters if lo <= ord(c) <= hi) / len(letters)


def language_adherence(agent_turns: list[str], script: str, threshold: float = 0.6) -> float:
    """Fraction of agent turns predominantly in the expected script. Code-mixed English words are tolerated."""
    if not agent_turns:
        return 0.0
    return sum(1 for t in agent_turns if script_ratio(t, script) >= threshold) / len(agent_turns)


def question_count(text: str) -> int:
    return len(re.findall(r"[?？]", text))


def one_question_per_turn(agent_turns: list[str]) -> float:
    """Fraction of agent turns with at most one question."""
    if not agent_turns:
        return 0.0
    return sum(1 for t in agent_turns if question_count(t) <= 1) / len(agent_turns)


def _norm(s: str) -> list[str]:
    s = unicodedata.normalize("NFC", s.lower())
    # Strip punctuation/symbols only. (A `[^\w\s]` regex would split Indic words at combining vowel signs.)
    s = "".join(" " if unicodedata.category(c)[0] in "PS" else c for c in s)
    return s.split()


def wer(reference: str, hypothesis: str) -> float:
    """Word error rate via Levenshtein distance over normalised tokens."""
    r, h = _norm(reference), _norm(hypothesis)
    if not r:
        return 0.0 if not h else 1.0
    prev = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        cur = [i]
        for j, hw in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rw != hw)))
        prev = cur
    return prev[-1] / len(r)


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p * (len(s) - 1))))]


def summary_accuracy(summary: dict, expect: dict) -> tuple[int, int]:
    """Compare a post-call summary with scenario ground truth. Returns (correct_fields, total_fields)."""
    ok = total = 0

    def check(cond: bool) -> None:
        nonlocal ok, total
        total += 1
        ok += bool(cond)

    if "mood" in expect:
        check(summary.get("mood") in expect["mood"])
    for med, taken in expect.get("meds", {}).items():
        found = [m for m in summary.get("meds", []) if med.lower() in str(m.get("name", "")).lower()]
        check(bool(found) and bool(found[0].get("taken")) == taken)
    for kw in expect.get("complaints_contain", []):
        check(any(kw.lower() in c.lower() for c in summary.get("complaints", [])))
    if "ate" in expect:
        check(summary.get("ate") == expect["ate"])
    for cat in expect.get("flag_categories", []):
        check(any(cat in f.get("category", "") for f in summary.get("flags", [])))
    if expect.get("no_flags"):
        check(not [f for f in summary.get("flags", []) if f.get("severity") in ("high", "emergency")])
    check(bool(str(summary.get("summary_for_family", "")).strip()))
    return ok, total
