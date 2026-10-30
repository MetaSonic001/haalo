"""Care features: dose times, vitals thresholds, festivals, insights maths, prompt modes. Pure logic only (no network, no database)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

import pytest

from haalo_voice import vitals as vt
from haalo_voice.doses import dose_datetimes, match_medicine, needs_refill, parse_time, week_start
from haalo_voice.festivals import occasions_on
from haalo_voice.insights import analyze
from haalo_voice.prompt import build_system_prompt
from haalo_voice.session import ApptLine, CallSession, DoseLine, MessageLine, demo_profile


# ---- dose times
@pytest.mark.parametrize(
    ("label", "expected"),
    [("morning", time(8, 30)), ("8am", time(8, 0)), ("8:30 pm", time(20, 30)), ("20:15", time(20, 15)), ("12 am", time(0, 0)), ("bedtime", time(21, 30))],
)
def test_parse_time(label, expected):
    assert parse_time(label) == expected


def test_parse_time_rejects_nonsense():
    assert parse_time("whenever") is None and parse_time("25:00") is None


def test_dose_datetimes_are_utc_for_the_local_day():
    out = dose_datetimes(["morning", "evening", "morning"], date(2026, 10, 25), "Asia/Kolkata")
    assert [d.astimezone(UTC).strftime("%H:%M") for d in out] == ["03:00", "13:00"]  # 08:30 and 18:30 IST


def test_match_medicine_is_forgiving():
    names = ["BP tablet", "Metformin", "Calcium"]
    assert match_medicine("metformin 500", names) == "Metformin"
    assert match_medicine("calcium", names) == "Calcium"
    assert match_medicine("bp", names) == "BP tablet"
    assert match_medicine("insulin", names) is None


def test_refill_threshold():
    assert needs_refill(9, 1, 2) is True  # 4.5 days left
    assert needs_refill(30, 1, 2) is False
    assert needs_refill(None, 1, 2) is False


def test_week_start_is_monday():
    assert week_start(date(2026, 10, 25)).weekday() == 0


# ---- vitals
def test_bp_thresholds():
    assert vt.evaluate("bp", 128, 82).flagged is False
    assert vt.evaluate("bp", 168, 104).severity == "medium"
    assert vt.evaluate("bp", 190, 125).severity == "high"
    assert vt.evaluate("bp", 84, 52).flagged is True


def test_bp_said_in_wrong_order_is_fixed():
    assert vt.normalize("bp", 82, 128) == (128, 82)


def test_celsius_temperature_is_converted():
    v, _ = vt.normalize("temperature", 38.5)
    assert 101 < v < 101.5
    assert vt.evaluate("temperature", v).flagged is True


def test_sugar_and_spo2_thresholds():
    assert vt.evaluate("sugar", 262).severity == "medium"
    assert vt.evaluate("sugar", 48).severity == "high"
    assert vt.evaluate("sugar", 110).flagged is False
    assert vt.evaluate("spo2", 88).severity == "high"


def test_per_parent_ranges_override_defaults():
    assert vt.evaluate("bp", 150, 90).flagged is False
    assert vt.evaluate("bp", 150, 90, {"bp": {"sys_high": 140}}).flagged is True


# ---- festivals
def test_festival_only_for_matching_tradition():
    day = date(2026, 11, 8)  # Diwali
    assert any("Diwali" in o for o in occasions_on(day, language="mr", tradition="hindu", birthday=None))
    assert occasions_on(day, language="mr", tradition="muslim", birthday=None) == []
    assert occasions_on(day, language="mr", tradition="", birthday=None) == []


def test_birthday_and_national_day_go_to_everyone():
    assert any("birthday" in o for o in occasions_on(date(2026, 3, 14), language="hi", tradition="", birthday="1957-03-14", parent_name="Aai"))
    assert any("Independence Day" in o for o in occasions_on(date(2026, 8, 15), language="hi", tradition="", birthday=None))


# ---- insights
def _call(days_ago: int, mood: str, words: int, *, slept="well", ate=True):
    when = datetime.now(UTC) - timedelta(days=days_ago)
    return {
        "id": f"c{days_ago}", "status": "completed", "started_at": when.isoformat(), "purpose": "checkin",
        "call_summaries": [{"mood": mood, "data": {"slept": slept, "ate": ate, "highlights": []}}],
        "call_turns": [{"speaker": "parent", "text": " ".join(["word"] * words)} for _ in range(4)],
    }


def test_insights_notice_a_low_quiet_week():
    calls = [_call(d, "good", 12) for d in range(8, 22)] + [_call(d, "low", 4, slept="poorly") for d in range(1, 7)]
    out = {i.kind: i for i in analyze({"calls": calls, "doses": [], "vitals": []}, date.today())}
    assert out["mood"].severity == "concern"
    assert out["engagement"].severity == "watch"
    assert out["sleep"].severity == "watch"
    assert "not a diagnosis" in out["mood"].body


def test_insights_say_steady_when_nothing_changes():
    calls = [_call(d, "good", 11) for d in range(1, 22)]
    kinds = {i.kind for i in analyze({"calls": calls, "doses": [], "vitals": []}, date.today())}
    assert kinds == {"steady"}


def test_adherence_insight():
    now = datetime.now(UTC)
    doses = [{"status": "missed", "due_at": (now - timedelta(days=d, hours=1)).isoformat()} for d in range(1, 5)] + [
        {"status": "taken", "due_at": (now - timedelta(days=d, hours=2)).isoformat()} for d in range(1, 3)
    ]
    out = {i.kind: i for i in analyze({"calls": [], "doses": doses, "vitals": []}, date.today())}
    assert out["adherence"].severity == "concern"


# ---- prompt modes
def _profile():
    p = demo_profile("en")
    p.doses_today = [DoseLine("e1", "BP tablet", "1 tablet", "8:30 am", "taken"), DoseLine("e2", "Metformin", "500 mg", "8:30 am", "pending")]
    p.messages = [MessageLine("m1", "Riya", "note", "Aarav scored 92 in maths!"), MessageLine("m2", "Aditya", "question", "Did you get the groceries?")]
    p.appointments = [ApptLine("a1", "Heart check-up", "Dr. Deshmukh", "tomorrow at 10:30 am")]
    p.occasions = ["Today is Diwali (Deepavali). Wish them warmly."]
    p.vital_kinds = ["bp"]
    return p


def test_checkin_prompt_skips_confirmed_doses_and_includes_family_items():
    prompt, _ = build_system_prompt(CallSession(profile=_profile()))
    assert "Metformin" in prompt and "taken BP tablet" not in prompt
    assert "Aarav scored 92" in prompt and "Did you get the groceries?" in prompt
    assert "Heart check-up" in prompt and "Diwali" in prompt and "log_vital" in prompt


def test_reminder_prompt_is_short_and_about_the_due_dose():
    s = CallSession(profile=_profile(), purpose="reminder", dose_event_ids=["e2"])
    prompt, _ = build_system_prompt(s)
    assert "MEDICINE REMINDER" in prompt and "Metformin" in prompt
    assert "Today's checklist" not in prompt


def test_inbound_prompt_explains_they_called():
    prompt, _ = build_system_prompt(CallSession(profile=_profile(), purpose="inbound", direction="inbound"))
    assert "They called YOU" in prompt and "Metformin at 8:30 am: not yet confirmed" in prompt
