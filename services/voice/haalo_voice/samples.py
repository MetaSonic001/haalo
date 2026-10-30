"""One-shot TTS for the landing page language samples. Uses whatever TTS provider is configured for the language."""

from __future__ import annotations

import base64

import httpx

from .config import Settings, provider_for
from .languages import Language
from .providers.bhashini import BhashiniClient

_cache: dict[tuple[str, str, str], tuple[bytes, str]] = {}


async def sample_audio(s: Settings, lang: Language, gender: str = "female") -> tuple[bytes, str]:
    """Returns (audio bytes, media type). Cached in memory per (provider, language, gender)."""
    provider = provider_for("tts", lang.code, s)
    key = (provider, lang.code, gender)
    if key in _cache:
        return _cache[key]
    text = lang.say("greeting", honorific=lang.default_honorific, child="Riya")

    if provider == "edge":
        if s.is_production or not s.dev_only:
            raise RuntimeError("Edge TTS is DEV_ONLY")
        voice = lang.voice(gender)
        if not voice:
            raise ValueError(f"No Edge voice for {lang.code}")
        import edge_tts

        chunks = bytearray()
        async for c in edge_tts.Communicate(text, voice, rate="-10%").stream():
            if c["type"] == "audio":
                chunks.extend(c["data"])
        out = (bytes(chunks), "audio/mpeg")
    elif provider == "sarvam":
        if not s.sarvam_api_key:
            raise ValueError("SARVAM_API_KEY missing")
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                "https://api.sarvam.ai/text-to-speech",
                headers={"api-subscription-key": s.sarvam_api_key},
                json={
                    "text": text,
                    "language_code": str(lang.tts["sarvam_lang"]),
                    "speaker": "priya" if gender == "female" else "shubh",
                    "model": s.sarvam_tts_model,
                    "pace": s.default_tts_pace,
                    "output_audio_codec": "mp3",
                },
            )
            r.raise_for_status()
            out = (base64.b64decode(r.json()["audios"][0]), "audio/mpeg")
    elif provider == "bhashini":
        client = BhashiniClient(s.bhashini_user_id, s.bhashini_api_key, s.bhashini_pipeline_id)
        out = (base64.b64decode(await client.tts(text, str(lang.tts["bhashini"]), gender)), "audio/wav")
    elif provider == "indic_local":
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{s.indic_local_url.rstrip('/')}/tts",
                json={"text": text, "language": lang.code, "voice": gender, "pace": s.default_tts_pace},
            )
            r.raise_for_status()
            out = (r.content, "audio/wav")
    elif provider == "groq_orpheus":
        if lang.code != "en":
            raise ValueError("groq_orpheus is English only")
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                "https://api.groq.com/openai/v1/audio/speech",
                headers={"Authorization": f"Bearer {s.groq_api_key}"},
                json={"model": s.groq_tts_model, "voice": "autumn", "input": text, "response_format": "wav"},
            )
            r.raise_for_status()
            out = (r.content, "audio/wav")
    else:
        raise ValueError(f"Unknown TTS provider '{provider}'")

    _cache[key] = out
    return out

