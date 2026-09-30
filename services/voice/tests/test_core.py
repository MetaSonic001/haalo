import pytest

from haalo_voice.config import ConfigError, Settings, fallback_for, provider_for, validate_startup
from haalo_voice.languages import get_language, load_registry
from haalo_voice.prompt import build_system_prompt, estimate_tokens
from haalo_voice.session import CallSession, demo_profile
from haalo_voice.telephony.base import BlockReason, CallOutcome
from haalo_voice.telephony.twilio_provider import TwilioProvider, _twiml


def settings(**kw) -> Settings:
    base = dict(_env_file=None)
    base.update(kw)
    return Settings(**base)


# ---- registry
def test_registry_launch_languages_present():
    reg = load_registry()
    for code in ("mr", "hi", "en"):
        assert reg[code].status == "launch"


@pytest.mark.parametrize("code", list(load_registry()))
def test_every_language_has_required_strings_and_phrases(code):
    lang = get_language(code)
    for key in ("consent", "greeting", "no_response", "closing", "emergency", "scam_warning", "declined_close"):
        assert lang.strings[key], f"{code}.{key}"
    lang.say("consent", honorific="X", child="Y")
    lang.say("closing", honorific="X", time="9")
    for cat in ("fall", "chest_pain", "breathing", "self_harm", "scam"):
        assert lang.emergency_phrases.get(cat), f"{code} missing {cat}"


@pytest.mark.parametrize(
    "code,text,category",
    [
        ("en", "I fell down in the bathroom", "fall"),
        ("en", "there is chest pain since morning", "chest_pain"),
        ("hi", "मुझे सीने में दर्द हो रहा है", "chest_pain"),
        ("hi", "बेटा किसी ने ओटीपी मांगा", "scam"),
        ("mr", "मी बाथरूममध्ये पडले", "fall"),
        ("mr", "मला छातीत दुखतंय", "chest_pain"),
    ],
)
def test_keyword_fast_path(code, text, category):
    hit = get_language(code).match_emergency(text)
    assert hit and hit[0] == category


def test_no_false_positive_on_ordinary_chat():
    assert get_language("en").match_emergency("I went to the temple and had tea") is None
    assert get_language("mr").match_emergency("आज मी देवळात गेले होते") is None


# ---- config guards
def test_edge_tts_refused_in_production():
    with pytest.raises(ConfigError):
        validate_startup(settings(app_env="production", default_tts_provider="edge", dev_only=True))


def test_edge_tts_requires_dev_only_flag():
    with pytest.raises(ConfigError):
        validate_startup(settings(default_tts_provider="edge", dev_only=False))


def test_edge_ok_in_dev():
    validate_startup(settings(default_tts_provider="edge", dev_only=True))


def test_unknown_provider_rejected():
    with pytest.raises(ConfigError):
        validate_startup(settings(default_stt_provider="nope"))


def test_per_language_override(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER_MR", "sarvam")
    monkeypatch.setenv("STT_FALLBACK_HI", "bhashini")
    s = settings(default_tts_provider="edge", dev_only=True)
    assert provider_for("tts", "mr", s) == "sarvam"
    assert provider_for("tts", "hi", s) == "edge"
    assert fallback_for("stt", "hi", s) == "bhashini"


def test_per_language_edge_override_blocked_in_production(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER_TA", "edge")
    with pytest.raises(ConfigError):
        validate_startup(settings(app_env="production", default_tts_provider="sarvam"))


# ---- prompt
def test_prompt_contains_safety_and_profile():
    prompt, version = build_system_prompt(CallSession(profile=demo_profile("mr")))
    assert "NEVER give medical advice" in prompt
    assert "Marathi" in prompt and "BP tablet" in prompt
    assert version != "unknown"


def test_first_call_prompt_asks_consent():
    p = demo_profile("hi")
    p.consent_status = "pending"
    prompt, _ = build_system_prompt(CallSession(profile=p))
    assert "FIRST call" in prompt and "record_consent" in prompt


def test_prompt_trims_to_budget():
    p = demo_profile("en")
    p.memories = [f"fact number {i} about something long and detailed " * 5 for i in range(15)]
    p.recent_summaries = ["a summary " * 40] * 3
    prompt, _ = build_system_prompt(CallSession(profile=p), budget_tokens=900)
    assert estimate_tokens(prompt) <= 1400  # persona alone is large; optional sections dropped
    assert "Other things you know" not in prompt


# ---- telephony
def test_twiml_stream_and_params():
    xml = _twiml("wss://x.example/telephony/ws", {"call_id": "abc", "to_number": "+919999999999"})
    assert "<Connect><Stream" in xml and 'name="call_id"' in xml and "wss://x.example" in xml


def test_twilio_status_mapping_and_trial_block():
    s = settings(twilio_account_sid="AC1", twilio_auth_token="t", twilio_phone_number="+15550001111")
    tw = TwilioProvider(s)
    u = tw.parse_status({"CallSid": "CA1", "CallStatus": "failed", "ErrorCode": "21219"})
    assert u.outcome == CallOutcome.FAILED and u.block_reason == BlockReason.TRIAL_UNVERIFIED_NUMBER
    assert tw.parse_status({"CallSid": "CA1", "CallStatus": "no-answer"}).outcome == CallOutcome.NO_ANSWER
    assert tw.parse_status({"CallSid": "CA1", "CallStatus": "completed", "CallDuration": "312"}).duration_s == 312


def test_pii_is_masked_in_logs():
    from haalo_voice.logging_setup import mask

    assert "9876543210" not in mask("dialing +919876543210 now")
    assert mask("call +91 98765 43210").endswith("10")
    assert "riya@example.com" not in mask("owner riya@example.com")


def test_model_verdict_needs_grounded_quote():
    from haalo_voice.safety import _verify_verdict

    text = "মোকাবিলা হাঁটুতে একটু ব্যথা আছে"
    assert _verify_verdict(text, "", "fall", "emergency") == "medium"  # no quote: downgraded
    assert _verify_verdict(text, "invented fall words", "fall", "emergency") == "medium"
    assert _verify_verdict("I fell in the bathroom", "I fell in the bathroom", "fall", "emergency") == "emergency"
    assert _verify_verdict(text, "", "other", "medium") == "medium"
