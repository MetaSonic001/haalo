"""Safety layer, runs on every parent turn.

Fast path: per-language keyword/phrase match (no network, works even if the LLM is down).
Model path: GROQ_MODEL_FAST classifier returning {category, severity, evidence_quote}.
Every decision is recorded with the evidence quote.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from loguru import logger
from pipecat.frames.frames import Frame, LLMMessagesAppendFrame, TranscriptionFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from .config import Settings
from .languages import Language
from .llm import chat_json
from .session import CallSession

EMERGENCY_CATEGORIES = {"fall", "chest_pain", "breathing", "confusion"}
SEVERITY_ORDER = ["none", "low", "medium", "high", "emergency"]
COOLDOWN_S = 90  # do not re-fire the same category constantly

CLASSIFIER_SYSTEM = """You are a safety classifier for phone calls with an elderly person. The text is what THEY said, in an Indian language
(possibly mixed with English). Return ONLY JSON: {"category": one of ["none","fall","chest_pain","breathing","confusion","self_harm","distress","scam","medical_concern","missed_medicine","other"],
"severity": one of ["none","low","medium","high","emergency"], "evidence_quote": "exact short quote from the text, or empty"}.
emergency = a fall with injury/unable to get up, chest pain, trouble breathing, fainting, sudden confusion, stroke signs, any statement of wanting to die.
high = new significant pain, repeated missed critical medicine, being pressured by a stranger for OTP/bank/money.
medium = ongoing complaint, low mood, loneliness. low = mild passing mention. none = ordinary chat. Do not over-trigger on ordinary talk."""

FlagSink = Callable[[dict], Awaitable[None]]


async def detect(text: str, lang: Language, s: Settings) -> SafetyEvent | None:
    """The same two-stage check the live processor uses, as a plain function (used by evals and tests).
    Keyword fast path first; otherwise the fast classifier model (if configured)."""
    hit = lang.match_emergency(text)
    if hit:
        return SafetyEvent(hit[0], _severity_for_keyword(hit[0]), hit[1], "keyword")
    if s.groq_model_fast and s.groq_api_key:
        out = await chat_json(s, s.groq_model_fast, CLASSIFIER_SYSTEM, text, max_tokens=120)
        cat, sev = str(out.get("category", "none")), str(out.get("severity", "none"))
        if cat != "none" and sev not in ("none", "low"):
            return SafetyEvent(cat, sev, str(out.get("evidence_quote", ""))[:300], "model")
    return None


@dataclass
class SafetyEvent:
    category: str
    severity: str
    evidence_quote: str
    source: str  # keyword | model


def _severity_for_keyword(category: str) -> str:
    if category in EMERGENCY_CATEGORIES or category == "self_harm":
        return "emergency"
    if category == "scam":
        return "high"
    return "medium"


def _guidance(category: str, crisis: str) -> str:
    if category == "self_harm":
        return (
            "SAFETY: The person expressed hopelessness or a wish not to live. Respond with real care in their language. Do not lecture. Do not discuss any "
            "method. Keep them talking, ask if someone is with them, and gently encourage them to be with family. Tell them the family is being informed. "
            f"If appropriate mention this helpline: {crisis}."
        )
    if category == "scam":
        return "SAFETY: A possible scam was mentioned. Warn gently: never share OTP, bank details or money on a call. Tell them the family is being informed."
    return (
        f"SAFETY: A possible emergency ({category}) was just reported and a calm scripted message was already spoken. Stay calm and kind. Ask if anyone is "
        "with them. Tell them to call someone at home or dial 112. Do NOT give any medical advice. Do NOT end the call. The family is being informed."
    )


def _verify_verdict(text: str, quote: str, category: str, severity: str) -> str:
    """Guard against classifier over-triggering. An emergency/high verdict must quote words the person actually said;
    a fall/chest-pain/breathing verdict without such a quote is downgraded to 'medium' (flag + family note, no scripted alarm)."""
    q = " ".join(quote.lower().split())
    said = " ".join(text.lower().split())
    grounded = bool(q) and (q in said or all(w in said for w in q.split()[:3]))
    if severity in ("emergency", "high") and not grounded:
        return "medium"
    return severity


class SafetyProcessor(FrameProcessor):
    def __init__(
        self,
        *,
        session: CallSession,
        lang: Language,
        settings: Settings,
        on_flag: FlagSink,
        crisis_resource: str = "Tele-MANAS 14416",
    ):
        super().__init__()
        self._session, self._lang, self._s = session, lang, settings
        self._on_flag = on_flag
        self._crisis = crisis_resource
        self._last_fired: dict[str, float] = {}

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            text = frame.text
            self._session.turns.append({"speaker": "parent", "text": text, "t": time.time()})
            hit = self._lang.match_emergency(text)
            if hit:
                category, phrase = hit
                await self._fire(SafetyEvent(category, _severity_for_keyword(category), phrase, "keyword"))
            elif self._s.groq_model_fast and self._s.groq_api_key:
                self.create_task(self._classify(text), name="safety-classify")
        await self.push_frame(frame, direction)

    async def _classify(self, text: str) -> None:
        try:
            out = await chat_json(self._s, self._s.groq_model_fast, CLASSIFIER_SYSTEM, text, max_tokens=120)
        except Exception as e:  # never break the call because the classifier failed; keyword path still active
            logger.warning(f"safety classifier failed: {e}")
            return
        cat, sev = str(out.get("category", "none")), str(out.get("severity", "none"))
        self._session.llm_tokens += int(out.get("_tokens", 0))
        if cat == "none" or sev in ("none", "low"):
            return
        quote = str(out.get("evidence_quote", ""))[:300]
        sev = _verify_verdict(text, quote, cat, sev)
        if sev in ("none", "low"):
            return
        await self._fire(SafetyEvent(cat, sev, quote, "model"))

    async def _fire(self, ev: SafetyEvent) -> None:
        now = time.time()
        if now - self._last_fired.get(ev.category, 0) < COOLDOWN_S:
            return
        self._last_fired[ev.category] = now
        flag = {"category": ev.category, "severity": ev.severity, "evidence_quote": ev.evidence_quote, "source": ev.source}
        self._session.flags.append(flag)
        logger.bind(call_id=self._session.call_id).warning(f"SAFETY {flag}")
        p = self._session.profile
        fmt = {"honorific": p.honorific, "child": p.child_name}
        if ev.category in EMERGENCY_CATEGORIES and (ev.source == "keyword" or ev.severity == "emergency"):
            self._session.emergency_active = True
            line = self._lang.say("emergency", **fmt)
            await self.push_frame(TTSSpeakFrame(line, append_to_context=False))
            await self.push_frame(LLMMessagesAppendFrame([{"role": "assistant", "content": line}], run_llm=False))
        elif ev.category == "scam":
            line = self._lang.say("scam_warning", **fmt)
            await self.push_frame(TTSSpeakFrame(line, append_to_context=False))
            await self.push_frame(LLMMessagesAppendFrame([{"role": "assistant", "content": line}], run_llm=False))
        if ev.category in EMERGENCY_CATEGORIES | {"self_harm", "scam"} and ev.severity in ("emergency", "high"):
            await self.push_frame(
                LLMMessagesAppendFrame(
                    [{"role": "system", "content": _guidance(ev.category, self._crisis)}], run_llm=False
                )
            )
        await self._on_flag(flag)
