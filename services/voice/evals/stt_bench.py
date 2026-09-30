"""Audio eval: WER per STT provider, on clean and 8 kHz phone-quality audio.

    uv run python -m evals.stt_bench --lang mr --providers groq_whisper,sarvam

Test utterances are synthesised from evals/utterances.json with whichever TTS is configured (Edge in dev, DEV_ONLY),
then optionally degraded to 8 kHz telephony. Synthesised speech is a proxy: the real bar comes from recorded elderly
phone speech (see the consented data flywheel). Set the WER targets after the first benchmark.
"""

from __future__ import annotations

import argparse
import asyncio
import audioop
import io
import json
import time
import wave
from pathlib import Path

import httpx

from haalo_voice.config import get_settings
from haalo_voice.languages import get_language
from haalo_voice.providers.bhashini import BhashiniClient
from haalo_voice.providers.custom_tts import EdgeTTSService, decode_to_pcm

from .metrics import percentile, wer

S = get_settings()
UTTERANCES = Path(__file__).with_name("utterances.json")


def to_wav(pcm: bytes, rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def phone_quality(pcm: bytes, rate: int) -> tuple[bytes, int]:
    """Downsample to 8 kHz, mu-law round trip (what a PSTN call does to speech)."""
    down, _ = audioop.ratecv(pcm, 2, 1, rate, 8000, None)
    return audioop.ulaw2lin(audioop.lin2ulaw(down, 2), 2), 8000


async def synth(lang_code: str, text: str) -> tuple[bytes, int]:
    lang = get_language(lang_code)
    voice = lang.voice("female")
    if not voice:
        raise RuntimeError(f"No dev voice for {lang_code}")
    import edge_tts

    chunks = bytearray()
    async for c in edge_tts.Communicate(text, voice).stream():
        if c["type"] == "audio":
            chunks.extend(c["data"])
    return decode_to_pcm(bytes(chunks), 16000)


async def transcribe(provider: str, wav: bytes, lang_code: str, hotwords: str = "") -> str:
    lang = get_language(lang_code)
    if provider == "groq_whisper":
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {S.groq_api_key}"},
                data={"model": S.groq_stt_model, "language": lang.stt["whisper"], "temperature": "0", **({"prompt": hotwords} if hotwords else {})},
                files={"file": ("a.wav", wav, "audio/wav")},
            )
            r.raise_for_status()
            return r.json()["text"]
    if provider == "bhashini":

        client = BhashiniClient(S.bhashini_user_id, S.bhashini_api_key, S.bhashini_pipeline_id)
        return await client.asr(wav, lang.stt["bhashini"], 16000)
    if provider == "indic_local":
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{S.indic_local_url.rstrip('/')}/stt", files={"file": ("a.wav", wav, "audio/wav")}, data={"language": lang_code})
            r.raise_for_status()
            return r.json()["text"]
    raise NotImplementedError(f"'{provider}' file-transcription eval not implemented yet (verify its REST docs first)")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="mr")
    ap.add_argument("--providers", default=S.default_stt_provider)
    ap.add_argument("--out", default="evals/out/wer.json")
    a = ap.parse_args()
    data = json.loads(UTTERANCES.read_text(encoding="utf-8"))
    items = data.get(a.lang, [])
    if not items:
        raise SystemExit(f"No utterances for '{a.lang}' in {UTTERANCES}")
    report: dict = {}
    for prov in a.providers.split(","):
        for cond in ("clean", "phone_8k"):
            wers, lats = [], []
            for it in items:
                pcm, rate = await synth(a.lang, it["text"])
                if cond == "phone_8k":
                    pcm, rate = phone_quality(pcm, rate)
                t0 = time.perf_counter()
                try:
                    hyp = await transcribe(prov, to_wav(pcm, rate), a.lang, it.get("hotwords", ""))
                except NotImplementedError as e:
                    print(e)
                    break
                lats.append((time.perf_counter() - t0) * 1000)
                wers.append(wer(it["text"], hyp))
                print(f"[{prov}/{cond}] WER {wers[-1]:.2f}  {it['text'][:40]} -> {hyp[:40]}")
            if wers:
                report[f"{prov}/{cond}"] = {"mean_wer": sum(wers) / len(wers), "n": len(wers), "p50_ms": percentile(lats, 0.5), "p95_ms": percentile(lats, 0.95)}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

__all__ = ["EdgeTTSService"]
