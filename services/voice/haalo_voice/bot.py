"""The call pipeline. Transport-agnostic: WebRTC, Twilio (and later Exotel/Plivo) all come through here.

Transport -> VAD/turns -> STT -> safety -> context -> LLM (streaming) -> TTS -> Transport
Everything provider/language/model related is resolved from config; nothing is hard-coded here.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable

from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    EndTaskFrame,
    FunctionCallResultProperties,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesAppendFrame,
    LLMTextFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
)
from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.turns.user_mute import MuteUntilFirstBotCompleteUserMuteStrategy
from pipecat.turns.user_start import MinWordsUserTurnStartStrategy
from pipecat.turns.user_stop import SpeechTimeoutUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.workers.runner import WorkerRunner

from .config import Settings
from .languages import get_language
from .llm import build_conversation_llm
from .prompt import build_system_prompt
from .providers.factory import build_stt, build_tts
from .safety import SafetyProcessor
from .session import CallSession
from .store import Store

OnFinished = Callable[[CallSession, str], Awaitable[None]]


def _tools() -> ToolsSchema:
    return ToolsSchema(
        standard_tools=[
            FunctionSchema(
                name="record_consent",
                description="Record whether the person agreed to receive these daily calls. Only on the very first call.",
                properties={"granted": {"type": "boolean", "description": "true if they clearly agreed"}},
                required=["granted"],
            ),
            FunctionSchema(
                name="set_preference",
                description="Record a scheduling wish: skip tomorrow, call later, or pause until a date.",
                properties={
                    "kind": {"type": "string", "enum": ["skip_tomorrow", "call_later", "pause_until"]},
                    "value": {"type": "string", "description": "minutes for call_later, ISO date for pause_until"},
                },
                required=["kind"],
            ),
            FunctionSchema(
                name="end_call",
                description="Hang up after a warm goodbye.",
                properties={"reason": {"type": "string", "enum": ["completed", "wants_to_stop", "consent_declined"]}},
                required=["reason"],
            ),
        ]
    )


# Whisper invents these on silence / background noise.
_HALLUCINATIONS = {"you", "thank you", "thanks", "thanks for watching", "bye", "okay", "ok", "hmm", "uh", "um", "the", "so", "yeah", "mm", "ah"}


class TranscriptFilter(FrameProcessor):
    """Drops junk transcripts (punctuation-only, single stray letters, classic Whisper hallucinations on noise) so they never
    start a turn, reach the safety layer or get answered."""

    def __init__(self, lang_code: str):
        super().__init__()
        self._lang = lang_code

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            t = frame.text.strip()
            letters = [c for c in t if c.isalpha()]
            plain = t.lower().strip(" .!?,।॥…-")
            if len(letters) < 2 or (self._lang != "en" and plain in _HALLUCINATIONS) or (plain in _HALLUCINATIONS and len(plain) < 6):
                logger.bind(call_id="-").debug(f"dropped junk transcript {t!r}")
                return
        await self.push_frame(frame, direction)


class AssistantMemory(FrameProcessor):
    """Records what the LLM says into the conversation context, so it remembers its own replies.

    Pipecat's own assistant aggregation relies on the TTS emitting spoken-text frames; that is provider-dependent, and when it does not
    happen the model loses all memory of what it said. Doing this here works with every TTS provider."""

    def __init__(self, context: LLMContext):
        super().__init__()
        self._ctx = context
        self._buf: list[str] = []

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._buf = []
        elif isinstance(frame, LLMTextFrame):
            self._buf.append(frame.text)
        elif isinstance(frame, LLMFullResponseEndFrame):
            text = "".join(self._buf).strip()
            self._buf = []
            if text:
                self._ctx.add_message({"role": "assistant", "content": text})
        await self.push_frame(frame, direction)


def _rebuild_turns(session: CallSession, context: LLMContext) -> None:
    """The context holds every spoken line in order (scripted lines, LLM replies, parent turns). Use it as the transcript."""
    now = time.time()
    turns: list[dict] = []
    for m in context.messages:
        role, content = m.get("role"), m.get("content")
        if role not in ("user", "assistant") or not isinstance(content, str) or not content.strip():
            continue
        turns.append({"speaker": "parent" if role == "user" else "agent", "text": content.strip(), "t": session.started_at + len(turns)})
    if turns:
        session.turns = turns
    session.tts_chars = sum(len(t["text"]) for t in turns if t["speaker"] == "agent")
    _ = now


async def run_call(
    transport,
    session: CallSession,
    s: Settings,
    store: Store,
    *,
    telephony: bool,
    on_finished: OnFinished | None = None,
    max_seconds: int | None = None,
) -> str:
    """Runs one call to completion. Returns final status (completed | no_response | failed)."""
    p = session.profile
    lang = get_language(p.language)
    log = logger.bind(call_id=session.call_id)
    fmt = {"honorific": p.honorific, "child": p.child_name, "time": p.next_call_time}

    system_prompt, persona_version = build_system_prompt(session, s.llm_prompt_token_budget)
    stt, session.stt_provider = build_stt(lang, s, p.hotwords())
    tts, session.tts_provider = build_tts(lang, s, p.voice_gender, p.pace or s.default_tts_pace)
    llm = build_conversation_llm(s)
    session.llm_model = s.groq_model_conversation

    context = LLMContext([{"role": "system", "content": system_prompt}], tools=_tools())
    silence_s = max(0.4, (p.silence_ms or s.default_silence_ms) / 1000)
    user_agg, asst_agg = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(confidence=s.vad_confidence, start_secs=s.vad_start_secs, stop_secs=0.2, min_volume=s.vad_min_volume)
            ),
            user_mute_strategies=[MuteUntilFirstBotCompleteUserMuteStrategy()] if s.mute_until_first_bot_complete else [],
            # Barge-in needs a real phrase: noise, coughs and one or two stray words do not interrupt the agent.
            # (When the agent is silent, even one word such as 'yes' starts the parent's turn.)
            user_turn_strategies=UserTurnStrategies(
                start=[MinWordsUserTurnStartStrategy(min_words=s.barge_in_min_words, use_interim=True)],
                stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=silence_s)],
            ),
            user_idle_timeout=float(s.no_response_seconds),
        ),
    )

    async def on_flag(flag: dict) -> None:
        await store.add_flag(session, flag)
        sev = flag["severity"]
        if sev in ("high", "emergency"):
            await store.notify_family(
                p.parent_id, "flag", f"{p.honorific}: {flag['category'].replace('_', ' ')} mentioned",
                f"\"{flag['evidence_quote']}\" - Haalo has flagged this. Please call {p.honorific}.",
                {"flag_category": flag["category"], "call_id": session.call_id, "severity": sev, "url": "/alerts"}, pref="emergency",
            )

    safety = SafetyProcessor(session=session, lang=lang, settings=s, on_flag=on_flag)

    record = p.recording_consent and not p.is_demo  # audio is opt-in per parent; default is transcripts only
    audio_buf = AudioBufferProcessor(num_channels=2) if record else None
    stages = [transport.input(), stt, TranscriptFilter(lang.code), safety, user_agg, llm, AssistantMemory(context), tts, transport.output()]
    if audio_buf:
        stages.append(audio_buf)
    pipeline = Pipeline([*stages, asst_agg])
    latency = UserBotLatencyObserver()

    @latency.event_handler("on_latency_measured")
    async def _lat(_obs, seconds: float):
        session.latencies_ms.append(seconds * 1000)
        log.info(f"latency end-of-speech->first-audio {seconds * 1000:.0f}ms")

    @latency.event_handler("on_latency_breakdown")
    async def _breakdown(_obs, breakdown):
        for line in breakdown.turn_contribution_lines():
            log.info(f"  latency {line}")
        # Response latency = the parts after the end-of-turn decision (LLM, sentence aggregation, TTS, transport). The patience
        # wait for slow speakers (VAD silence, STT, turn detection) is deliberate and excluded; it is in the raw total above.
        waiting = ("endpoint", "transcription", "turn detection", "turn completion", "user turn")
        parts = [c.duration_secs for c in breakdown.contributions if not any(w in c.label.lower() for w in waiting)]
        if parts and breakdown.measured_from is not None and 0 < sum(parts) < 30:
            session.response_latencies_ms.append(sum(parts) * 1000)
            log.info(f"  response after end-of-turn: {session.response_latencies_ms[-1]:.0f}ms")

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000 if telephony else 16000,
            audio_out_sample_rate=8000 if telephony else 24000,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[latency],
        idle_timeout_secs=None,  # we run our own no-response and time-limit logic
    )

    state = {"idle_tries": 0, "status": "completed"}

    # ---- tools
    async def record_consent(params):
        granted = bool(params.arguments.get("granted"))
        session.consent_result = granted
        await store.set_consent(session, granted)
        if not granted:
            await store.notify_family(
                p.parent_id, "consent", f"{p.honorific} declined the daily calls",
                "Haalo won't call again unless you change this. You may want to talk to them first.", {"call_id": session.call_id}, pref="summary",
            )
        else:
            p.consent_status = "granted"
        await params.result_callback({"ok": True})

    async def set_preference(params):
        session.preference = dict(params.arguments)
        await store.apply_preference(session, session.preference)
        await params.result_callback({"ok": True})

    async def end_call(params):
        reason = str(params.arguments.get("reason", "completed"))
        session.end_reason = reason
        await params.result_callback({"ok": True}, properties=FunctionCallResultProperties(run_llm=False))
        state["status"] = "completed"
        await params.llm.push_frame(EndTaskFrame(), FrameDirection.UPSTREAM)

    llm.register_function("record_consent", record_consent)
    llm.register_function("set_preference", set_preference)
    llm.register_function("end_call", end_call)

    if audio_buf:

        @audio_buf.event_handler("on_audio_data")
        async def _audio(_buf, audio, sample_rate, num_channels):
            import io
            import wave

            out = io.BytesIO()
            with wave.open(out, "wb") as w:
                w.setnchannels(num_channels)
                w.setsampwidth(2)
                w.setframerate(sample_rate)
                w.writeframes(audio)
            await store.save_recording(session, out.getvalue())

    # ---- transcript capture
    @asst_agg.event_handler("on_assistant_turn_started")
    async def _asst_start(_agg):
        pass

    @asst_agg.event_handler("on_assistant_turn_stopped")
    async def _asst_turn(_agg, message):

        if message.content:
            session.turns.append({"speaker": "agent", "text": message.content, "t": time.time()})
            session.tts_chars += len(message.content)

    # ---- no response: gentle prompt, then hang up after N tries
    @user_agg.event_handler("on_user_turn_idle")
    async def _idle(_agg):
        state["idle_tries"] += 1
        if state["idle_tries"] > s.no_response_max_tries:
            session.end_reason = "no_response"
            state["status"] = "no_response"
            await user_agg.push_frame(EndTaskFrame(), FrameDirection.UPSTREAM)
            return
        nr = lang.say("no_response", **fmt)
        context.add_message({"role": "assistant", "content": nr})
        await user_agg.push_frame(TTSSpeakFrame(nr, append_to_context=False))

    @user_agg.event_handler("on_user_turn_started")
    async def _spoke(_agg, _strategy):
        state["idle_tries"] = 0

    # ---- opening line and watchdog
    async def watchdog():
        limit = max_seconds or s.max_call_minutes * 60
        try:
            await asyncio.sleep(max(30, limit - 60))
            await worker.queue_frame(
                LLMMessagesAppendFrame(
                    [{"role": "system", "content": "TIME IS ALMOST UP. Wrap up warmly in one or two sentences, say you will call tomorrow, then call end_call."}],
                    run_llm=True,
                )
            )
            await asyncio.sleep(60)
            session.end_reason = session.end_reason or "time_limit"
            await worker.queue_frame(EndTaskFrame(), FrameDirection.UPSTREAM)
        except asyncio.CancelledError:
            pass

    watchdog_task: asyncio.Task | None = None

    @transport.event_handler("on_client_connected")
    async def _connected(_t, _client):
        nonlocal watchdog_task
        log.info(f"connected lang={p.language} stt={session.stt_provider} tts={session.tts_provider} persona={persona_version}")
        first = "consent" if p.consent_status == "pending" else "greeting"
        if audio_buf:
            await audio_buf.start_recording()
        opening = lang.say(first, **fmt)
        context.add_message({"role": "assistant", "content": opening})  # the model must know it already greeted / asked consent
        await worker.queue_frame(TTSSpeakFrame(opening, append_to_context=False))
        watchdog_task = asyncio.create_task(watchdog())

    @transport.event_handler("on_client_disconnected")
    async def _disconnected(_t, _client):
        log.info("client disconnected")
        await worker.cancel()

    await store.update_call(
        session.call_id, status="in_progress", persona_version=persona_version, language=p.language,
        provider=session.provider, stt_provider=session.stt_provider, tts_provider=session.tts_provider, llm_model=session.llm_model,
    )
    try:
        runner = WorkerRunner(handle_sigint=False)
        await runner.add_workers(worker)
        await runner.run()
    except Exception as e:
        log.exception(f"call crashed: {e}")
        state["status"] = "failed"
        session.end_reason = f"error: {e}"
    finally:
        if watchdog_task:
            watchdog_task.cancel()
        if audio_buf:
            try:
                await audio_buf.stop_recording()
            except Exception as e:  # noqa: BLE001 - a failed recording must never break call cleanup
                log.warning(f"recording stop failed: {e}")
        status = state["status"]
        _rebuild_turns(session, context)
        await store.finish_call(session, status)
        if on_finished:
            try:
                await on_finished(session, status)
            except Exception as e:
                log.exception(f"post-call job failed: {e}")
    return state["status"]
