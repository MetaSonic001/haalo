"""Central configuration. Everything provider/language/model related comes from env (root .env)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
# Root .env is the single place the owner edits. A services/voice/.env may override for local tweaks.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "services" / "voice" / ".env", override=True)

STT_PROVIDERS = ("groq_whisper", "sarvam", "bhashini", "indic_local")
TTS_PROVIDERS = ("edge", "sarvam", "bhashini", "indic_local", "groq_orpheus")
TELEPHONY_PROVIDERS = ("twilio", "exotel", "plivo")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # Runtime
    app_env: str = "development"  # development | production
    dev_only: bool = False  # enables DEV_ONLY providers (edge tts) - refused in production
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 7860
    public_voice_base_url: str = ""  # https URL of this service (tunnel in dev)
    internal_service_key: str = ""  # auth for POST /calls/dial

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # LLM (Groq)
    groq_api_key: str = ""
    groq_model_conversation: str = ""
    groq_model_fast: str = ""
    groq_model_summary: str = ""
    groq_model_fallback: str = ""  # used on 429/5xx from the conversation model
    llm_prompt_token_budget: int = 3500

    # Providers
    default_stt_provider: str = "groq_whisper"
    default_tts_provider: str = "edge"
    stt_fallback_provider: str = ""
    tts_fallback_provider: str = ""
    groq_stt_model: str = "whisper-large-v3-turbo"
    groq_tts_model: str = "canopylabs/orpheus-v1-english"
    sarvam_api_key: str = ""
    sarvam_stt_model: str = "saaras:v3"
    sarvam_tts_model: str = "bulbul:v3"
    bhashini_user_id: str = ""
    bhashini_api_key: str = ""
    bhashini_pipeline_id: str = ""
    indic_local_url: str = ""

    # Turn-taking (elderly friendly). Per-parent values in DB override these.
    default_silence_ms: int = 1000
    default_tts_pace: float = 0.9
    no_response_seconds: int = 8
    no_response_max_tries: int = 2
    max_call_minutes: int = 10
    # Interruption / noise robustness
    barge_in_min_words: int = 3  # while the agent is speaking, the parent must say this many words to interrupt it
    vad_confidence: float = 0.8  # Silero threshold: higher = ignores more background noise
    vad_min_volume: float = 0.55
    vad_start_secs: float = 0.3  # speech must persist this long before it counts as speech
    mute_until_first_bot_complete: bool = True  # noise can't cut off the opening/consent line

    # Telephony
    telephony_provider: str = "twilio"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_trial: bool = True  # trial accounts: verified numbers only, 10 min cap, trial message
    exotel_sid: str = ""
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_subdomain: str = ""
    exotel_caller_id: str = ""
    plivo_auth_id: str = ""
    plivo_auth_token: str = ""
    plivo_number: str = ""

    # Scheduler
    scheduler_enabled: bool = True
    scheduler_poll_seconds: int = 30
    call_retry_minutes: int = 15
    call_max_retries: int = 2

    # Care features
    dose_remind_retry_minutes: int = 20  # a reminder is repeated this long after the first if the dose is still unconfirmed
    dose_max_reminders: int = 2
    dose_missed_after_minutes: int = 90  # unconfirmed this long after the due time = missed (family is told)
    dose_fold_into_checkin_minutes: int = 60  # a daily check-in due this soon asks about the dose instead of a separate call
    escalation_step_seconds: int = 300  # wait for an acknowledgement before the next contact is tried
    escalation_missed_days: int = 2  # this many consecutive unanswered days start the escalation ladder
    groq_model_vision: str = ""  # photo proofs; defaults to the conversation model when it accepts images
    proof_max_bytes: int = 6_000_000
    demo_workspace: bool = False  # lets the web demo workspace talk to its sandbox parents over WebRTC (never real parents)
    demo_family_id: str = ""

    # Demo protection
    turnstile_secret: str = ""
    demo_max_seconds: int = 180

    # Observability
    sentry_dsn: str = ""

    # Cost rates (INR unless noted) - config so billing math is never hard-coded
    rate_telephony_per_min: float = 0.0
    rate_stt_per_second: float = 0.0
    rate_llm_per_1k_tokens: float = 0.0
    rate_tts_per_1k_chars: float = 0.0

    cors_origins: str = Field(default="http://localhost:3000")

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def provider_for(kind: str, lang: str, settings: Settings | None = None) -> str:
    """Resolve provider for ('stt'|'tts', language). Per-language env override wins:
    STT_PROVIDER_MR=sarvam, TTS_PROVIDER_HI=indic_local ...
    """
    s = settings or get_settings()
    override = os.environ.get(f"{kind.upper()}_PROVIDER_{lang.upper()}", "").strip().lower()
    if override:
        return override
    return (s.default_stt_provider if kind == "stt" else s.default_tts_provider).strip().lower()


def fallback_for(kind: str, lang: str, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    override = os.environ.get(f"{kind.upper()}_FALLBACK_{lang.upper()}", "").strip().lower()
    if override:
        return override
    return (s.stt_fallback_provider if kind == "stt" else s.tts_fallback_provider).strip().lower()


class ConfigError(RuntimeError):
    pass


def validate_startup(s: Settings) -> None:
    """Fail loudly on misconfiguration that would only surface mid-call."""
    problems: list[str] = []
    from .languages import load_registry

    if s.is_production and s.dev_only:
        problems.append("DEV_ONLY=true is not allowed when APP_ENV=production")
    for lang in ["default", *load_registry()]:
        for kind, allowed in (("stt", STT_PROVIDERS), ("tts", TTS_PROVIDERS)):
            for p in (provider_for(kind, lang, s), fallback_for(kind, lang, s)):
                if p and p not in allowed:
                    problems.append(f"{kind.upper()} provider '{p}' ({lang}) unknown; use {allowed}")
                if kind == "tts" and p == "edge" and (s.is_production or not s.dev_only):
                    problems.append(
                        f"TTS provider 'edge' ({lang}) is DEV_ONLY: needs DEV_ONLY=true and APP_ENV!=production"
                    )
    if s.telephony_provider not in TELEPHONY_PROVIDERS:
        problems.append(f"TELEPHONY_PROVIDER '{s.telephony_provider}' unknown; use {TELEPHONY_PROVIDERS}")
    if problems:
        raise ConfigError("; ".join(problems))
