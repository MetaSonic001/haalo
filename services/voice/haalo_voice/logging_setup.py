"""Structured JSON logs (production) with PII masked. Every line can carry call_id via logger.bind(call_id=...)."""

from __future__ import annotations

import re
import sys

from loguru import logger

_PHONE = re.compile(r"(\+?\d[\d\s-]{6,}\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def mask(text: str) -> str:
    """Phone numbers keep only the last 2 digits; emails keep the first letter. Names are masked by callers that know them."""

    def phone(m: re.Match) -> str:
        digits = re.sub(r"\D", "", m.group(0))
        return f"***{digits[-2:]}" if len(digits) >= 8 else m.group(0)

    return _EMAIL.sub(lambda m: m.group(0)[0] + "***@***", _PHONE.sub(phone, text))


def setup_logging(level: str = "INFO", json: bool = False) -> None:
    logger.remove()

    def patch(record):
        record["message"] = mask(record["message"])

    logger.configure(patcher=patch)
    logger.add(sys.stderr, level=level, serialize=json, backtrace=False, diagnose=False, format="{time:HH:mm:ss} | {level:<7} | {extra[call_id]} | {message}" if not json else "{message}",
               filter=lambda r: r["extra"].setdefault("call_id", "-") is not None)
