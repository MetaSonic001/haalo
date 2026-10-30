"""Groq LLM wiring: startup model validation, conversation LLM with failover, JSON helper for fast/summary models."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
from loguru import logger
from openai import RateLimitError
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


class QuotaAwareGroqLLM(GroqLLMService):
    """Groq conversation LLM that moves to GROQ_MODEL_FALLBACK when the primary model is rate limited (HTTP 429).

    Groq rate limits are per model (tokens per minute and per day), so a second model is a second quota. Without this a 429 simply
    silenced the call: Sneha stopped answering mid-conversation. After a 429 the fallback is used for `cooldown_s`, then the primary
    is tried again."""

    fallback_model: str | None = None
    cooldown_s: float = 600.0
    _degraded_until: float = 0.0

    def build_chat_completion_params(self, params_from_context):
        params = super().build_chat_completion_params(params_from_context)
        if self.fallback_model and time.time() < self._degraded_until:
            params["model"] = self.fallback_model
            if eff := reasoning_effort(self.fallback_model):
                params["reasoning_effort"] = eff
            else:
                params.pop("reasoning_effort", None)
        return params

    async def get_chat_completions(self, context):
        try:
            return await super().get_chat_completions(context)
        except RateLimitError as e:
            if not self.fallback_model or time.time() < self._degraded_until:
                raise
            logger.warning(f"Groq rate limit on the conversation model; using {self.fallback_model} for {self.cooldown_s:.0f}s ({str(e)[:140]})")
            self._degraded_until = time.time() + self.cooldown_s
            return await super().get_chat_completions(context)


def build_conversation_llm(s: Settings) -> QuotaAwareGroqLLM:
    """Conversation LLM. If GROQ_MODEL_FALLBACK is set it takes over automatically while the primary model is rate limited."""
    model = s.groq_model_conversation
    extra = {"reasoning_effort": e} if (e := reasoning_effort(model)) else {}
    llm = QuotaAwareGroqLLM(
        api_key=s.groq_api_key,
        settings=GroqLLMService.Settings(model=model, temperature=0.6, max_completion_tokens=220, **extra),
    )
    if s.groq_model_fallback and s.groq_model_fallback != model:
        llm.fallback_model = s.groq_model_fallback
    return llm


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
