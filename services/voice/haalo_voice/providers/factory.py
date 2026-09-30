"""Builds STT/TTS Pipecat services from config. The bot never imports a provider directly."""

from __future__ import annotations

from collections.abc import Callable

from loguru import logger
from pipecat.pipeline.service_switcher import ServiceSwitcher, ServiceSwitcherStrategyFailover
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.transcriptions.language import Language

from ..config import Settings, fallback_for, provider_for
from ..languages import Language as LangEntry
from .bhashini import BhashiniClient, BhashiniSTTService, IndicLocalSTTService
from .custom_tts import BhashiniTTSService, EdgeTTSService, IndicLocalTTSService

# Pipecat Language enums per registry code
_PIPECAT_LANG = {
    "mr": Language.MR_IN, "hi": Language.HI_IN, "en": Language.EN_IN, "gu": Language.GU_IN,
    "ta": Language.TA_IN, "te": Language.TE_IN, "kn": Language.KN_IN, "bn": Language.BN_IN,
    "ml": Language.ML_IN, "pa": Language.PA_IN,
}  # fmt: skip


_WHISPER_LANG = {
    "mr": Language.MR, "hi": Language.HI, "en": Language.EN, "gu": Language.GU, "ta": Language.TA,
    "te": Language.TE, "kn": Language.KN, "bn": Language.BN, "ml": Language.ML, "pa": Language.PA,
}  # fmt: skip


def _bhashini(s: Settings) -> BhashiniClient:
    return BhashiniClient(s.bhashini_user_id, s.bhashini_api_key, s.bhashini_pipeline_id)


def build_stt_one(provider: str, lang: LangEntry, s: Settings, hotwords: str = "") -> FrameProcessor:
    if provider == "groq_whisper":
        from pipecat.services.groq.stt import GroqSTTService

        if not s.groq_api_key:
            raise ValueError("GROQ_API_KEY missing for groq_whisper STT")
        return GroqSTTService(
            api_key=s.groq_api_key,
            settings=GroqSTTService.Settings(
                model=s.groq_stt_model,
                language=_WHISPER_LANG.get(lang.code, _PIPECAT_LANG[lang.code]),
                prompt=hotwords or None,  # per-family vocab as Whisper prompt
                temperature=0.0,
            ),
        )
    if provider == "sarvam":
        from pipecat.services.sarvam.stt import SarvamSTTService

        if not s.sarvam_api_key:
            raise ValueError("SARVAM_API_KEY missing for sarvam STT")
        return SarvamSTTService(
            api_key=s.sarvam_api_key,
            settings=SarvamSTTService.Settings(
                model=s.sarvam_stt_model, language=_PIPECAT_LANG[lang.code]
            ),
        )
    if provider == "bhashini":
        return BhashiniSTTService(client=_bhashini(s), language=str(lang.stt["bhashini"]))
    if provider == "indic_local":
        if not s.indic_local_url:
            raise ValueError("INDIC_LOCAL_URL missing for indic_local STT")
        return IndicLocalSTTService(url=s.indic_local_url, language=lang.code)
    raise ValueError(f"Unknown STT provider '{provider}'")


def build_tts_one(
    provider: str, lang: LangEntry, s: Settings, gender: str, pace: float
) -> FrameProcessor:
    if provider == "edge":
        # Config validation already refuses this in production; belt and braces.
        if s.is_production or not s.dev_only:
            raise RuntimeError("Edge TTS is DEV_ONLY")
        voice = lang.voice(gender)
        if not voice:
            raise ValueError(f"No Edge voice for '{lang.code}'")
        return EdgeTTSService(voice=voice, language=lang.code, pace=pace)
    if provider == "sarvam":
        from pipecat.services.sarvam.tts import SarvamTTSService

        if not s.sarvam_api_key:
            raise ValueError("SARVAM_API_KEY missing for sarvam TTS")
        speaker = "priya" if gender == "female" else "shubh"
        return SarvamTTSService(
            api_key=s.sarvam_api_key,
            settings=SarvamTTSService.Settings(
                model=s.sarvam_tts_model,
                voice=speaker,
                language=_PIPECAT_LANG[lang.code],
                pace=pace,
            ),
        )
    if provider == "groq_orpheus":
        from pipecat.services.groq.tts import GroqTTSService

        if lang.code != "en":
            raise ValueError("groq_orpheus TTS is English only")
        if not s.groq_api_key:
            raise ValueError("GROQ_API_KEY missing for groq_orpheus TTS")
        return GroqTTSService(api_key=s.groq_api_key, settings=GroqTTSService.Settings(model=s.groq_tts_model))
    if provider == "bhashini":
        return BhashiniTTSService(
            client=_bhashini(s), voice=gender, language=str(lang.tts["bhashini"]), gender=gender
        )
    if provider == "indic_local":
        if not s.indic_local_url:
            raise ValueError("INDIC_LOCAL_URL missing for indic_local TTS")
        return IndicLocalTTSService(
            url=s.indic_local_url, voice=gender, language=lang.code, pace=pace
        )
    raise ValueError(f"Unknown TTS provider '{provider}'")


def _with_failover(kind: str, build: Callable[[str], FrameProcessor], primary: str, fallback: str):
    services: list[FrameProcessor] = [build(primary)]
    if fallback and fallback != primary:
        try:
            services.append(build(fallback))
        except Exception as e:  # fallback misconfigured must not kill the call
            logger.warning(f"{kind} fallback '{fallback}' unavailable: {e}")
    if len(services) == 1:
        return services[0]
    return ServiceSwitcher(services=services, strategy_type=ServiceSwitcherStrategyFailover)


def build_stt(lang: LangEntry, s: Settings, hotwords: str = ""):
    primary, fb = provider_for("stt", lang.code, s), fallback_for("stt", lang.code, s)
    logger.info(f"STT[{lang.code}] primary={primary} fallback={fb or '-'}")
    return _with_failover("STT", lambda p: build_stt_one(p, lang, s, hotwords), primary, fb), primary


def build_tts(lang: LangEntry, s: Settings, gender: str, pace: float):
    primary, fb = provider_for("tts", lang.code, s), fallback_for("tts", lang.code, s)
    logger.info(f"TTS[{lang.code}] primary={primary} fallback={fb or '-'}")
    return _with_failover("TTS", lambda p: build_tts_one(p, lang, s, gender, pace), primary, fb), primary
