"""How well does Whisper (the configured Groq model) hear the synthesised parent lines? Run before recording to pick phrasing that is understood.

    cd services/voice && uv run python ../../tools/demo-video/stt_probe.py mr
"""

from __future__ import annotations

import asyncio
import io
import sys
import wave

import edge_tts
import httpx
import miniaudio

from haalo_voice.config import get_settings
from haalo_voice.languages import get_language

LINES = {
    "mr": [
        "हो, मी आज सकाळी गोळी घेतली.",
        "मी बरी आहे. आज गोळी घेतली.",
        "सगळं छान आहे. मी औषध घेतलं.",
        "अरे वा! आरवला शाबास म्हणा. माझा गुडघा थोडा दुखतोय.",
        "हो, पुरणपोळी आणा. आणि बाकरवडी पण.",
        "ठीक आहे. उद्या बोलूया.",
    ],
}


async def synth(lang: str, gender: str, text: str, rate: str) -> bytes:
    voice = get_language(lang).voice(gender)
    raw = bytearray()
    async for c in edge_tts.Communicate(text, voice, rate=rate).stream():
        if c["type"] == "audio":
            raw.extend(c["data"])
    d = miniaudio.decode(bytes(raw), output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1, sample_rate=16000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(d.samples.tobytes())
    return buf.getvalue()


async def main() -> None:
    lang = sys.argv[1] if len(sys.argv) > 1 else "mr"
    s = get_settings()
    hot = "आई, औषध, गोळी, गुडघा, आरव, पुरणपोळी, बाकरवडी, बीपी"
    async with httpx.AsyncClient(timeout=60) as c:
        for rate in ("+0%",):
            print(f"--- rate {rate}")
            for text in LINES[lang]:
                wav = await synth(lang, "female", text, rate)
                r = await c.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {s.groq_api_key}"},
                    data={"model": s.groq_stt_model, "language": lang, "prompt": hot, "temperature": "0"},
                    files={"file": ("a.wav", wav, "audio/wav")},
                )
                print(f"{text}\n   -> {r.json().get('text', r.text)[:120]}")


asyncio.run(main())
