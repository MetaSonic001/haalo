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
    LLMContextFrame,
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

from . import vitals as vt
from .config import Settings
from .doses import match_medicine
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
                name="confirm_dose",
                description="Record that the person took (taken=true) or has not yet taken (taken=false) one of their medicines.",
                properties={
                    "medicine": {"type": "string", "description": "the medicine name from your notes"},
                    "taken": {"type": "boolean"},
                },
                required=["medicine", "taken"],
            ),
            FunctionSchema(
                name="log_vital",
                description="Save a health reading the person told you, after repeating it back and hearing them agree.",
                properties={
                    "kind": {"type": "string", "enum": ["bp", "sugar", "weight", "temperature", "spo2", "pulse"]},
                    "value": {"type": "number", "description": "bp: the top (systolic) number"},
                    "value2": {"type": "number", "description": "bp only: the bottom (diastolic) number"},
                    "context": {"type": "string", "description": "optional, e.g. fasting or after meal"},
                },
                required=["kind", "value"],
            ),
            FunctionSchema(
                name="request_family_help",
                description="Alert the family now because the person asked for them or needs help.",
                properties={"reason": {"type": "string", "description": "short reason in English"}},
                required=["reason"],
            ),
            FunctionSchema(
                name="end_call",
                description="Hang up after a warm goodbye.",
                properties={"reason": {"type": "string", "enum": ["completed", "wants_to_stop", "consent_declined"]}},
                required=["reason"],
            ),
        ]
    )


# Some chat templates (Qwen) refuse a context with no user message. When the agent opens the call itself, this cue is the user turn;
# it is never part of the stored transcript.
CALL_CONNECTED = "(call connected)"

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


class FamilyMessageNudge(FrameProcessor):
    """Makes sure the family's messages are really passed on. The prompt asks the model to deliver them right after the first
    exchange, but models drift; so on each of the parent's first turns one pending message is added to the context as a plain instruction."""

    def __init__(self, context: LLMContext, messages: list):
        super().__init__()
        self._ctx = context
        self._pending = list(messages)
        self._turns = 0

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMContextFrame) and self._pending:
            last = self._ctx.messages[-1] if self._ctx.messages else {}
            if last.get("role") == "user" and last.get("content") != CALL_CONNECTED:
                self._turns += 1
            if self._turns >= 2 and last.get("role") == "user" and last.get("content") != CALL_CONNECTED:
                # not on the very first answer ("I'm fine"): the model handles that one itself, then one message per turn
                m = self._pending.pop(0)
                who = m.from_name or "a family member"
                if m.kind == "note":
                    todo = f'First react to what they just said in one short sentence. Then pass on this message from {who}, warmly, in your own words, saying who it is from: "{m.body}"'
                else:
                    todo = f'First react to what they just said in one short sentence. Then ask them this question from {who}, naturally: "{m.body}"'
                self._ctx.add_message({"role": "system", "content": f"NOW: {todo} Say nothing else in this reply."})
        await self.push_frame(frame, direction)


class AssistantMemory(FrameProcessor):
    """Records what the LLM says into the conversation context, so it remembers its own replies.

    Pipecat's own assistant aggregation relies on the TTS emitting spoken-text frames; that is provider-dependent, and when it does not
    happen the model loses all memory of what it said. Doing this here works with every TTS provider."""

    def __init__(self, context: LLMContext, session: CallSession | None = None):
        super().__init__()
        self._ctx = context
        self._session = session
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
                if self._session:
                    self._session.emit("agent", text)
        elif isinstance(frame, TTSSpeakFrame) and self._session:
            self._session.emit("agent", frame.text)  # scripted lines (opening, emergency, scam warning)
        await self.push_frame(frame, direction)


def _rebuild_turns(session: CallSession, context: LLMContext) -> None:
    """The context holds every spoken line in order (scripted lines, LLM replies, parent turns). Use it as the transcript."""
    now = time.time()
    turns: list[dict] = []
    for m in context.messages:
        role, content = m.get("role"), m.get("content")
        if role not in ("user", "assistant") or not isinstance(content, str) or not content.strip() or content == CALL_CONNECTED:
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
    escalator=None,
) -> str:
    """Runs one call to completion. Returns final status (completed | no_response | failed)."""
    p = session.profile
    lang = get_language(p.language)
    log = logger.bind(call_id=session.call_id)
    if session.purpose == "reminder":
        max_seconds = max_seconds or 180  # a reminder is a minute or two, never a long call
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
        if sev == "emergency" and escalator and not p.is_demo:
            session.emit("alert", "Alert ladder started: the whole family is notified, then emergency contacts in order.")
            quote = flag["evidence_quote"]
            await escalator.start(p.parent_id, "emergency", f"{p.honorific} said: \"{quote}\" ({flag['category'].replace('_', ' ')}).", call_id=session.call_id)
        if sev in ("high", "emergency"):
            await store.notify_family(
                p.parent_id, "flag", f"{p.honorific}: {flag['category'].replace('_', ' ')} mentioned",
                f"\"{flag['evidence_quote']}\" - Sneha has flagged this. Please call {p.honorific}.",
                {"flag_category": flag["category"], "call_id": session.call_id, "severity": sev, "url": "/alerts"}, pref="emergency",
            )

    safety = SafetyProcessor(session=session, lang=lang, settings=s, on_flag=on_flag)

    record = p.recording_consent and not p.is_demo  # audio is opt-in per parent; default is transcripts only
    audio_buf = AudioBufferProcessor(num_channels=2) if record else None
    stages = [transport.input(), stt, TranscriptFilter(lang.code), safety, user_agg, FamilyMessageNudge(context, p.messages), llm, AssistantMemory(context, session), tts, transport.output()]
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
                "Sneha won't call again unless you change this. You may want to talk to them first.", {"call_id": session.call_id}, pref="summary",
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

    async def confirm_dose(params):
        name, taken = str(params.arguments.get("medicine", "")), bool(params.arguments.get("taken"))
        session.doses_confirmed.append({"medicine": name, "taken": taken})
        if not taken:
            await params.result_callback({"ok": True, "note": "noted as not yet taken; the family is told only if it stays unconfirmed"})
            return
        via = {"reminder": "reminder_call", "inbound": "inbound"}.get(session.purpose, "call")
        open_names = [d.medicine for d in p.doses_today if d.status != "taken"] or [m.name for m in p.medicines]
        matched = match_medicine(name, open_names)
        if matched is None:
            await params.result_callback({"ok": False, "note": "that medicine is not due or is already confirmed"})
            return
        for d in p.doses_today:
            if d.medicine == matched and d.status != "taken":
                d.status = "taken"
                break
        session.emit("action", f"Dose confirmed: {matched}")
        # The model gets its answer straight away; the database write and the family notice happen alongside the conversation.
        await params.result_callback({"ok": True, "matched": matched})
        if p.is_demo:
            return

        async def persist() -> None:
            try:
                hit = await store.confirm_dose(p.parent_id, matched, p.timezone, via=via, call_id=session.call_id)
                if hit and session.purpose == "reminder":
                    await store.notify_family(p.parent_id, "dose", f"{p.honorific} took {hit['medicine']}", "Confirmed on Sneha's reminder call.", {"call_id": session.call_id, "url": "/medicines"}, pref="summary")
                if hit and hit.get("refill"):
                    await store.notify_family(p.parent_id, "reminder", f"{hit['medicine']} is running low", f"{p.honorific}'s supply is about five days from running out.", {"url": "/medicines"}, pref="summary")
            except Exception as e:  # noqa: BLE001 - a failed write is retried by the post-call safety net
                log.warning(f"confirm_dose persist failed: {e}")

        background.add(t := asyncio.create_task(persist()))
        t.add_done_callback(background.discard)

    background: set[asyncio.Task] = set()

    async def log_vital(params):
        a = params.arguments
        try:
            kind = str(a.get("kind", "")).lower()
            if kind not in vt.KINDS:
                raise ValueError("unknown kind")
            value, value2 = vt.normalize(kind, float(a["value"]), float(a["value2"]) if a.get("value2") is not None else None)
            if kind == "bp" and value2 is None:
                await params.result_callback({"saved": False, "note": "a blood pressure needs both numbers; ask for the bottom number"})
                return
        except (KeyError, TypeError, ValueError):
            await params.result_callback({"saved": False, "note": "could not understand that reading; ask them to say it again"})
            return
        verdict = vt.evaluate(kind, value, value2, p.vital_ranges)
        session.emit("action", f"Reading saved: {vt.LABELS[kind]} {vt.describe(kind, value, value2)}" + (" (outside the family's range)" if verdict.flagged else ""))
        session.vitals_logged.append({"kind": kind, "value": value, "value2": value2, "flagged": verdict.flagged})
        say = "tell them you have noted it and will let the family know" if verdict.flagged else "tell them you have noted it"
        await params.result_callback({"saved": True, "outside_family_range": verdict.flagged, "say": say})
        if p.is_demo:
            return

        async def persist() -> None:
            try:
                await store.log_vital(p.parent_id, kind, value, value2, vt.UNITS[kind], context=str(a.get("context", "")), source="call", call_id=session.call_id, flagged=verdict.flagged)
                if verdict.flagged:
                    flag = {"category": f"vitals_{kind}", "severity": verdict.severity, "evidence_quote": vt.describe(kind, value, value2), "source": "vitals"}
                    session.flags.append(flag)
                    await on_flag(flag)
                    if verdict.severity == "medium":
                        await store.notify_family(
                            p.parent_id, "vital", f"{p.honorific}: {verdict.reason}", "Sneha only noted the number and did not give advice. You may want to call.",
                            {"call_id": session.call_id, "url": "/health"}, pref="summary",
                        )
            except Exception as e:  # noqa: BLE001
                log.warning(f"log_vital persist failed: {e}")

        background.add(t := asyncio.create_task(persist()))
        t.add_done_callback(background.discard)

    async def request_family_help(params):
        session.help_requested = True
        session.emit("alert", "They asked for the family. Alerting everyone now.")
        reason = str(params.arguments.get("reason", "")) or "They asked for help."
        if escalator and not p.is_demo:
            await escalator.start(p.parent_id, "parent_request", f"{p.honorific} asked Sneha to alert the family: {reason}", call_id=session.call_id)
        await params.result_callback({"ok": True, "say": "tell them you are informing the family right now"})

    llm.register_function("record_consent", record_consent)
    llm.register_function("confirm_dose", confirm_dose)
    llm.register_function("log_vital", log_vital)
    llm.register_function("request_family_help", request_family_help)
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
        if session.purpose in ("reminder", "inbound") and first == "greeting":
            # Not the standard daily greeting: the model opens the call itself, following the mode instructions in its prompt.
            await worker.queue_frame(LLMMessagesAppendFrame([{"role": "user", "content": CALL_CONNECTED}], run_llm=True))
        else:
            opening = lang.say(first, **fmt)
            context.add_message({"role": "assistant", "content": opening})  # the model must know it already greeted / asked consent
            await worker.queue_frame(TTSSpeakFrame(opening, append_to_context=False))
        watchdog_task = asyncio.create_task(watchdog())

    disconnected = asyncio.Event()

    @transport.event_handler("on_client_disconnected")
    async def _disconnected(_t, _client):
        log.info("client disconnected")
        disconnected.set()
        await worker.cancel()

    await store.update_call(
        session.call_id, status="in_progress", persona_version=persona_version, language=p.language,
        provider=session.provider, stt_provider=session.stt_provider, tts_provider=session.tts_provider, llm_model=session.llm_model,
    )
    try:
        runner = WorkerRunner(handle_sigint=False)
        await runner.add_workers(worker)
        run_task = asyncio.create_task(runner.run())
        gone = asyncio.create_task(disconnected.wait())
        await asyncio.wait({run_task, gone}, return_when=asyncio.FIRST_COMPLETED)
        if not run_task.done():
            # The caller hung up. The pipeline normally winds down by itself; if it hangs (a TTS request mid-flight), do not
            # lose the call: give it a few seconds, then stop it so the transcript, summary and notifications still happen.
            try:
                await asyncio.wait_for(asyncio.shield(run_task), 6)
            except asyncio.TimeoutError:
                log.warning("pipeline did not stop after hang-up, cancelling it")
                run_task.cancel()
                await asyncio.gather(run_task, return_exceptions=True)
        gone.cancel()
        if run_task.done() and not run_task.cancelled() and run_task.exception():
            raise run_task.exception()
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
        session.end_feed()
        if background:
            await asyncio.gather(*background, return_exceptions=True)
        status = state["status"]
        _rebuild_turns(session, context)
        await store.finish_call(session, status)
        if on_finished:
            try:
                await on_finished(session, status)
            except Exception as e:
                log.exception(f"post-call job failed: {e}")
    return state["status"]
