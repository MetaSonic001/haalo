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
class DoseLine:
    event_id: str
    medicine: str
    dose_text: str
    due_label: str  # local time, e.g. "8:30 am"
    status: str  # pending | reminded | taken | missed | skipped


@dataclass
class ApptLine:
    id: str
    title: str
    doctor: str
    when_text: str  # "tomorrow at 10:30 am"


@dataclass
class MessageLine:
    id: str
    from_name: str
    kind: str  # note | question
    body: str


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
    is_demo: bool = False  # the public anonymous demo persona: nothing is stored
    sandbox: bool = False  # a demo-workspace parent: real rows, made-up phone number
    tradition: str = ""
    birthday: str | None = None
    vital_ranges: dict = field(default_factory=dict)
    vital_kinds: list[str] = field(default_factory=list)  # what they have measured recently (bp, sugar ...)
    doses_today: list[DoseLine] = field(default_factory=list)
    appointments: list[ApptLine] = field(default_factory=list)
    messages: list[MessageLine] = field(default_factory=list)
    occasions: list[str] = field(default_factory=list)
    refills: list[str] = field(default_factory=list)

    def hotwords(self) -> str:
        words = [*self.vocab, *self.doctor_names, *self.family_names.values(), *[m.name for m in self.medicines]]
        seen: list[str] = []
        for w in words:
            if w and w not in seen:
                seen.append(w)
        return ", ".join(seen)[:400]


@dataclass
class LiveFeed:
    """What a browser demo shows while the call is happening: the transcript and what Sneha did (confirmed a dose, logged a reading, raised an alert)."""

    items: list[dict] = field(default_factory=list)
    done: bool = False
    created: float = field(default_factory=time.time)


FEEDS: dict[str, LiveFeed] = {}


def _prune_feeds() -> None:
    cutoff = time.time() - 1800
    for k in [k for k, f in FEEDS.items() if f.created < cutoff]:
        FEEDS.pop(k, None)


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
    purpose: str = "checkin"  # checkin | reminder | inbound
    dose_event_ids: list[str] = field(default_factory=list)  # a reminder call is about these doses
    delivered_message_ids: list[str] = field(default_factory=list)
    vitals_logged: list[dict] = field(default_factory=list)
    doses_confirmed: list[dict] = field(default_factory=list)
    help_requested: bool = False
    feed: LiveFeed | None = None

    def __post_init__(self) -> None:
        # Only the public demo persona and demo-workspace parents expose a live feed; real families' calls never do.
        if self.profile.is_demo or self.profile.sandbox:
            _prune_feeds()
            self.feed = FEEDS.setdefault(self.call_id, LiveFeed())

    def emit(self, kind: str, text: str) -> None:
        """kind: parent | agent | action | alert"""
        if self.feed is not None and text:
            self.feed.items.append({"i": len(self.feed.items), "kind": kind, "text": text, "t": round(time.time() - self.started_at, 1)})

    def end_feed(self) -> None:
        if self.feed is not None:
            self.feed.done = True


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
        doses_today=[DoseLine("demo-1", "BP tablet", "1 tablet", "8:30 am", "pending")],
        is_demo=True,
    )


# Sessions created at dial time, picked up when the telephony media socket connects.
PENDING: dict[str, CallSession] = {}
