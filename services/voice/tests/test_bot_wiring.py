"""Integration test of the real call pipeline (haalo_voice.bot.run_call) with fake transport/STT/LLM/TTS.

No network, no keys. Proves the wiring: aggregators + turn strategies + safety layer + event handlers + tools registration + cleanup.
"""

import asyncio

from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    TTSSpeakFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.utils.time import time_now_iso8601

from haalo_voice import bot
from haalo_voice.config import Settings
from haalo_voice.session import CallSession, demo_profile
from haalo_voice.store import NullStore


class Passthrough(FrameProcessor):
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)


class FakeInput(Passthrough):
    async def say(self, text: str):
        await self.push_frame(VADUserStartedSpeakingFrame())
        await self.push_frame(TranscriptionFrame(text, "user", time_now_iso8601()))
        await self.push_frame(VADUserStoppedSpeakingFrame())


class Collector(Passthrough):
    def __init__(self):
        super().__init__()
        self.spoken: list[str] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        if isinstance(frame, TTSSpeakFrame):
            self.spoken.append(frame.text)
        await super().process_frame(frame, direction)


class FakeLLM(Passthrough):
    def __init__(self):
        super().__init__()
        self.functions: dict[str, object] = {}

    def register_function(self, name, handler, **kw):
        self.functions[name] = handler


class FakeTransport:
    def __init__(self):
        self.inp = FakeInput()
        self.out = Collector()
        self.handlers: dict[str, object] = {}

    def input(self):
        return self.inp

    def output(self):
        return self.out

    def event_handler(self, name):
        def deco(fn):
            self.handlers[name] = fn
            return fn

        return deco


class RecordingStore(NullStore):
    def __init__(self):
        self.flags: list[dict] = []
        self.finished: list[str] = []
        self.notified: list[str] = []
        self.consent: list[bool] = []

    async def add_flag(self, session, flag):
        self.flags.append(flag)

    async def finish_call(self, session, status):
        self.finished.append(status)

    async def notify_family(self, parent_id, kind, title, body, data, *, pref):
        self.notified.append(kind)

    async def set_consent(self, session, granted):
        self.consent.append(granted)


async def _drive(monkeypatch, language: str, utterance: str | None, consent_pending=False):
    fake_llm = FakeLLM()
    monkeypatch.setattr(bot, "build_stt", lambda lang, s, hot="": (Passthrough(), "fake_stt"))
    monkeypatch.setattr(bot, "build_tts", lambda lang, s, g, p: (Passthrough(), "fake_tts"))
    monkeypatch.setattr(bot, "build_conversation_llm", lambda s: fake_llm)

    transport, store = FakeTransport(), RecordingStore()
    profile = demo_profile(language)
    if consent_pending:
        profile.consent_status = "pending"
    session = CallSession(profile=profile)
    settings = Settings(_env_file=None, default_silence_ms=400, mute_until_first_bot_complete=False)

    task = asyncio.create_task(bot.run_call(transport, session, settings, store, telephony=False, max_seconds=90))
    for _ in range(100):  # wait for the pipeline to register its event handlers
        if "on_client_connected" in transport.handlers:
            break
        await asyncio.sleep(0.05)
    assert "on_client_connected" in transport.handlers, "pipeline never registered handlers"
    await asyncio.sleep(0.5)  # let StartFrame propagate
    await transport.handlers["on_client_connected"](transport, None)
    if utterance:
        await asyncio.sleep(0.3)
        await transport.inp.say(utterance)
    await asyncio.sleep(1.0)
    await transport.handlers["on_client_disconnected"](transport, None)
    status = await asyncio.wait_for(task, timeout=15)
    return transport, store, session, fake_llm, status


async def test_pipeline_boots_speaks_greeting_and_cleans_up(monkeypatch):
    transport, store, session, llm, status = await _drive(monkeypatch, "mr", None)
    assert any("हालो" in s for s in transport.out.spoken), transport.out.spoken  # scripted Marathi greeting
    assert store.finished, "finish_call must run on disconnect"
    assert {"record_consent", "set_preference", "end_call"} <= set(llm.functions)
    assert session.stt_provider == "fake_stt" and session.tts_provider == "fake_tts"


async def test_first_call_opens_with_consent_script(monkeypatch):
    transport, *_ = await _drive(monkeypatch, "hi", None, consent_pending=True)
    assert any("एआई सहायक" in s for s in transport.out.spoken), transport.out.spoken


async def test_emergency_phrase_triggers_scripted_response_and_family_alert(monkeypatch):
    transport, store, session, _llm, _ = await _drive(monkeypatch, "mr", "मी बाथरूममध्ये पडले आणि उठता येत नाही")
    assert any(f["category"] == "fall" and f["severity"] == "emergency" for f in store.flags), store.flags
    assert any("112" in s for s in transport.out.spoken), "scripted emergency line (with 112) must be spoken"
    assert "flag" in store.notified, "family must be alerted"
    assert session.emergency_active
    assert store.flags[0]["evidence_quote"], "every safety decision is logged with an evidence quote"


async def test_scam_signal_warns_and_alerts(monkeypatch):
    transport, store, *_ = await _drive(monkeypatch, "hi", "किसी ने फोन करके ओटीपी माँगा")
    assert any(f["category"] == "scam" for f in store.flags)
    assert any("ओटीपी" in s for s in transport.out.spoken)
    assert "flag" in store.notified


async def test_ordinary_chat_raises_no_flags(monkeypatch):
    _t, store, session, *_ = await _drive(monkeypatch, "en", "I went to the temple and had tea with my neighbour")
    assert store.flags == []
    assert any(t["speaker"] == "parent" for t in session.turns), "parent turn must be recorded for the transcript"


async def test_consent_tool_persists_and_notifies_on_decline(monkeypatch):
    _t, store, session, llm, _ = await _drive(monkeypatch, "mr", None, consent_pending=True)

    class P:  # FunctionCallParams stand-in
        arguments = {"granted": False}

        async def result_callback(self, *a, **k):
            pass

    await llm.functions["record_consent"](P())
    assert store.consent == [False] and session.consent_result is False
    assert "consent" in store.notified
