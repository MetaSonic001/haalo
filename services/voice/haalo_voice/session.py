"""Per-call state: who we are calling and what we know. Loaded from Supabase, or a demo profile."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field


@dataclass
class Medicine:
    name: str
    dose_text: str = ""
    times: list[str] = field(default_factory=list)


@dataclass
class ParentProfile:
    parent_id: str
    name: str
    language: str  # registry code
    honorific: str
    child_name: str
    phone_e164: str = ""
    dialect: str = ""
    voice_gender: str = "female"
    pace: float = 0.9
    silence_ms: int = 1000
    consent_status: str = "pending"  # pending | granted | declined
    family_id: str = ""
    recording_consent: bool = False  # opt-in only; default is transcripts, not audio
    interests: list[str] = field(default_factory=list)
    family_names: dict[str, str] = field(default_factory=dict)
    doctor_names: list[str] = field(default_factory=list)
    vocab: list[str] = field(default_factory=list)  # STT hotwords: names, medicines, villages
    medicines: list[Medicine] = field(default_factory=list)
    pinned_facts: list[str] = field(default_factory=list)
    memories: list[str] = field(default_factory=list)
    recent_summaries: list[str] = field(default_factory=list)  # newest first, max 3
    follow_ups: list[str] = field(default_factory=list)
    next_call_time: str = "9:00"
    timezone: str = "Asia/Kolkata"
    family_language: str = "English"  # language of summaries for the family (owner app_language)
    is_demo: bool = False

    def hotwords(self) -> str:
        words = [*self.vocab, *self.doctor_names, *self.family_names.values(), *[m.name for m in self.medicines]]
        seen: list[str] = []
        for w in words:
            if w and w not in seen:
                seen.append(w)
        return ", ".join(seen)[:400]


@dataclass
class CallSession:
    profile: ParentProfile
    direction: str = "outbound"  # outbound | inbound
    call_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    provider: str = "webrtc"
    provider_call_id: str | None = None
    started_at: float = field(default_factory=time.time)
    # Filled during the call
    turns: list[dict] = field(default_factory=list)
    flags: list[dict] = field(default_factory=list)
    latencies_ms: list[float] = field(default_factory=list)  # end of speech -> first audio (includes patience wait)
    response_latencies_ms: list[float] = field(default_factory=list)  # after end-of-turn decision (budgeted)
    llm_tokens: int = 0
    tts_chars: int = 0
    consent_result: bool | None = None
    preference: dict | None = None
    end_reason: str | None = None
    emergency_active: bool = False
    stt_provider: str = ""
    tts_provider: str = ""
    llm_model: str = ""


def demo_profile(language: str = "mr", honorific: str | None = None) -> ParentProfile:
    """Demo persona for the public landing demo and /dev/voice. No real data."""
    from .languages import get_language

    lang = get_language(language)
    return ParentProfile(
        parent_id="demo",
        name="Demo",
        language=language,
        honorific=honorific or lang.default_honorific,
        child_name="Riya",
        consent_status="granted",
        interests=["bhajans", "grandchildren", "morning walk"],
        family_names={"grandson": "Aarav"},
        medicines=[Medicine("BP tablet", times=["morning"])],
        recent_summaries=["Went to the temple with a neighbour. Knee a little sore in the evening."],
        follow_ups=["Ask how the knee is today"],
        is_demo=True,
    )


# Sessions created at dial time, picked up when the telephony media socket connects.
PENDING: dict[str, CallSession] = {}
