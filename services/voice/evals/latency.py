"""Per-stage latency benchmark. Reports p50/p95 for LLM time-to-first-token and TTS time-to-first-audio.

    uv run python -m evals.latency --lang mr --n 8

(STT latency is measured by evals.stt_bench; whole-call end-of-speech -> first audio is logged live per call.)
Budget: end-of-speech -> first audio byte under 1.2 s on phone and 800 ms on WebRTC.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time

import httpx

from haalo_voice.config import get_settings, provider_for
from haalo_voice.languages import get_language
from haalo_voice.llm import GROQ_BASE
from haalo_voice.prompt import build_system_prompt
from haalo_voice.samples import sample_audio
from haalo_voice.session import CallSession, demo_profile

from .metrics import percentile

S = get_settings()


async def llm_ttft(lang_code: str) -> float:
    system, _ = build_system_prompt(CallSession(profile=demo_profile(lang_code)), S.llm_prompt_token_budget)
    body = {
        "model": S.groq_model_conversation, "stream": True, "max_completion_tokens": 60,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": "ठीक आहे, तुम्ही कसे आहात?" if lang_code == "mr" else "I am fine, how are you?"}],
    }
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=30) as c:
        async with c.stream("POST", f"{GROQ_BASE}/chat/completions", headers={"Authorization": f"Bearer {S.groq_api_key}"}, json=body) as r:
            async for line in r.aiter_lines():
                if line.startswith("data:") and '"content"' in line and '""' not in line.split('"content":')[1][:3]:
                    return (time.perf_counter() - t0) * 1000
    return (time.perf_counter() - t0) * 1000


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="mr")
    ap.add_argument("--n", type=int, default=8)
    a = ap.parse_args()
    lang = get_language(a.lang)
    out: dict = {"tts_provider": provider_for("tts", a.lang, S)}
    if S.groq_api_key and S.groq_model_conversation:
        xs = [await llm_ttft(a.lang) for _ in range(a.n)]
        out["llm_ttft_ms"] = {"p50": percentile(xs, 0.5), "p95": percentile(xs, 0.95), "model": S.groq_model_conversation}
    import haalo_voice.samples as smp

    ts = []
    for _ in range(min(a.n, 4)):
        smp._cache.clear()
        t0 = time.perf_counter()
        await sample_audio(S, lang)
        ts.append((time.perf_counter() - t0) * 1000)
    out["tts_full_utterance_ms"] = {"p50": percentile(ts, 0.5), "p95": percentile(ts, 0.95), "note": "whole greeting, not first byte; streaming providers start sooner"}
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
