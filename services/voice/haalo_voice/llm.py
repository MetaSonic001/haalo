"""Groq LLM wiring: startup model validation, conversation LLM with failover, JSON helper for fast/summary models."""

from __future__ import annotations

import json
from typing import Any

import httpx
from loguru import logger
from pipecat.pipeline.llm_switcher import LLMSwitcher
from pipecat.pipeline.service_switcher import ServiceSwitcherStrategyFailover
from pipecat.services.groq.llm import GroqLLMService

from .config import ConfigError, Settings

GROQ_BASE = "https://api.groq.com/openai/v1"
_MODEL_KEYS = ("groq_model_conversation", "groq_model_fast", "groq_model_summary")


async def list_models(s: Settings) -> list[str]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GROQ_BASE}/models", headers={"Authorization": f"Bearer {s.groq_api_key}"})
        r.raise_for_status()
        return sorted(m["id"] for m in r.json()["data"])


async def validate_models(s: Settings) -> list[str]:
    """GET /models and fail loudly if any configured model id does not exist (never invent IDs)."""
    if not s.groq_api_key:
        raise ConfigError("GROQ_API_KEY is not set")
    missing_cfg = [k.upper() for k in _MODEL_KEYS if not getattr(s, k)]
    if missing_cfg:
        raise ConfigError(f"Set {', '.join(missing_cfg)} in .env. Run `uv run haalo-models` to list valid ids.")
    available = await list_models(s)
    wanted = {getattr(s, k) for k in _MODEL_KEYS if getattr(s, k)}
    if s.groq_model_fallback:
        wanted.add(s.groq_model_fallback)
    if s.default_stt_provider == "groq_whisper":
        wanted.add(s.groq_stt_model)
    bad = sorted(m for m in wanted if m not in available)
    if bad:
        raise ConfigError(f"Groq model id(s) not found via GET /models: {bad}. Available: {available}")
    logger.info(f"Groq models validated: {sorted(wanted)}")
    return available


def reasoning_effort(model: str) -> str | None:
    """Reasoning models must not think out loud on a phone call. Values differ per model family (Groq docs):
    gpt-oss accepts low/medium/high; qwen accepts none/default; non-reasoning models reject the parameter."""
    m = model.lower()
    if m.startswith("openai/gpt-oss"):
        return "low"
    if m.startswith("qwen/"):
        return "none"
    return None


def _one(s: Settings, model: str, temperature: float = 0.6) -> GroqLLMService:
    extra = {"reasoning_effort": e} if (e := reasoning_effort(model)) else {}
    return GroqLLMService(
        api_key=s.groq_api_key,
        settings=GroqLLMService.Settings(model=model, temperature=temperature, max_completion_tokens=220, **extra),
    )


def build_conversation_llm(s: Settings):
    """Conversation LLM; if GROQ_MODEL_FALLBACK is set, fail over to it on hard errors (e.g. sustained 429)."""
    primary = _one(s, s.groq_model_conversation)
    if s.groq_model_fallback and s.groq_model_fallback != s.groq_model_conversation:
        return LLMSwitcher(
            llms=[primary, _one(s, s.groq_model_fallback)], strategy_type=ServiceSwitcherStrategyFailover
        )
    return primary


async def chat_json(s: Settings, model: str, system: str, user: str, max_tokens: int = 700) -> dict[str, Any]:
    """One-shot JSON-mode completion (classification, post-call summary). Retries once on 429/5xx."""
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        # reasoning models spend part of the budget thinking: leave headroom so the JSON is never cut off
        "max_completion_tokens": max_tokens * (3 if model.startswith("openai/gpt-oss") else 1),
    }
    if (eff := reasoning_effort(model)):
        body["reasoning_effort"] = eff
    last: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(
                    f"{GROQ_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {s.groq_api_key}"},
                    json=body,
                )
            if r.status_code in (429, 500, 502, 503):
                raise httpx.HTTPStatusError(f"{r.status_code}", request=r.request, response=r)
            r.raise_for_status()
            data = r.json()
            data["_tokens"] = data.get("usage", {}).get("total_tokens", 0)
            out = json.loads(data["choices"][0]["message"]["content"])
            out["_tokens"] = data["_tokens"]
            return out
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            last = e
            import asyncio

            await asyncio.sleep(0.5 * (2**attempt))
    raise RuntimeError(f"Groq JSON call failed after retries: {last}")
