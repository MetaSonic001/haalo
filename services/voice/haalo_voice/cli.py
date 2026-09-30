"""`uv run haalo-models` lists valid Groq model ids for your key (never guess IDs)."""

from __future__ import annotations

import asyncio

from .config import get_settings
from .llm import list_models


def models() -> None:
    s = get_settings()
    if not s.groq_api_key:
        raise SystemExit("Set GROQ_API_KEY in .env first")
    for m in asyncio.run(list_models(s)):
        print(m)
