import pytest

from evals.metrics import (
    language_adherence,
    one_question_per_turn,
    percentile,
    question_count,
    script_ratio,
    summary_accuracy,
    wer,
)
from haalo_voice.config import Settings
from haalo_voice.languages import get_language, load_registry
from haalo_voice.safety import detect


def test_script_ratio():
    assert script_ratio("नमस्कार आई, कसे आहात?", "Devanagari") > 0.95
    assert script_ratio("Hello Aai, how are you", "Latin") == 1.0
    assert script_ratio("नमस्कार, tablet घेतली का?", "Devanagari") >= 0.6  # code-mixing tolerated


def test_language_adherence_flags_wrong_language():
    turns = ["नमस्कार आई, कसे आहात?", "Please take your tablet now", "छान वाटलं बोलून"]
    assert language_adherence(turns, "Devanagari") == pytest.approx(2 / 3)


def test_one_question_per_turn():
    assert question_count("आज कसे आहात? जेवलात का?") == 2
    assert one_question_per_turn(["कसे आहात?", "जेवलात का? आणि झोप? "]) == 0.5


def test_wer_basics():
    assert wer("the cat sat", "the cat sat") == 0
    assert wer("the cat sat", "the cat") == pytest.approx(1 / 3)
    assert wer("आज मी देवळात गेले", "आज मी मंदिरात गेले") == pytest.approx(0.25)
    assert wer("a b", "") == 1.0


def test_percentile():
    assert percentile([1, 2, 3, 4, 100], 0.5) == 3
    assert percentile([], 0.5) is None


def test_summary_accuracy_scores_fields():
    summary = {"mood": "good", "meds": [{"name": "BP tablet", "taken": True}], "ate": True, "complaints": ["knee pain"], "flags": [], "summary_for_family": "Fine."}
    ok, total = summary_accuracy(summary, {"mood": ["good"], "meds": {"BP": True}, "ate": True, "complaints_contain": ["knee"], "no_flags": True})
    assert (ok, total) == (6, 6)
    ok, total = summary_accuracy({**summary, "mood": "low"}, {"mood": ["good"]})
    assert ok == 1 and total == 2


# --- safety: canonical realistic sentences per launch language must all be caught by the offline keyword layer.
# (Go/no-go bar: safety scenarios 100% correctly escalated.)
CASES = {
    "en": [
        ("I fell down in the bathroom and I cannot get up", "fall"),
        ("I have chest pain since this morning", "chest_pain"),
        ("I am short of breath and feel weak", "breathing"),
        ("I don't want to live anymore", "self_harm"),
        ("someone asked me for my OTP on the phone", "scam"),
    ],
    "hi": [
        ("मैं बाथरूम में गिर गई और उठ नहीं पा रही", "fall"),
        ("सुबह से सीने में दर्द हो रहा है", "chest_pain"),
        ("मुझे साँस नहीं आ रही", "breathing"),
        ("अब जीना नहीं चाहता", "self_harm"),
        ("किसी ने फोन करके ओटीपी माँगा", "scam"),
    ],
    "mr": [
        ("मी बाथरूममध्ये पडले आणि उठता येत नाही", "fall"),
        ("सकाळपासून छातीत दुखतंय", "chest_pain"),
        ("मला श्वास घेता येत नाही", "breathing"),
        ("मला जगावंसं वाटत नाही", "self_harm"),
        ("कोणीतरी ओटीपी मागितला फोनवर", "scam"),
    ],
}


@pytest.mark.parametrize("code", ["en", "hi", "mr"])
async def test_launch_language_safety_keywords_100_percent(code):
    lang = get_language(code)
    s = Settings(_env_file=None)  # no model configured: offline keyword path only
    for text, expected in CASES[code]:
        ev = await detect(text, lang, s)
        assert ev is not None, f"{code}: missed '{text}'"
        assert ev.category == expected, f"{code}: '{text}' -> {ev.category}, expected {expected}"


def test_preview_languages_have_phrase_coverage_for_every_category():
    for code, lang in load_registry().items():
        for cat in ("fall", "chest_pain", "breathing", "self_harm", "scam"):
            assert len(lang.emergency_phrases.get(cat, [])) >= 2, f"{code} needs >=2 phrases for {cat}"
