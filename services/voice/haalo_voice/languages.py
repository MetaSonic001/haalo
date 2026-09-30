"""Language registry loaded from packages/shared/languages.json (shared with the TS side)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache

from .config import REPO_ROOT

REGISTRY_PATH = REPO_ROOT / "packages" / "shared" / "languages.json"


@dataclass(frozen=True)
class Language:
    code: str
    status: str  # launch | preview | planned
    name: str
    native_name: str
    script: str
    stt: dict[str, str]
    tts: dict[str, object]
    honorifics: list[str]
    default_honorific: str
    strings: dict[str, str]
    emergency_phrases: dict[str, list[str]] = field(default_factory=dict)
    honorifics_native: dict[str, str] = field(default_factory=dict)

    def voice(self, gender: str) -> str | None:
        voices = self.tts.get("edge_voices", {})  # type: ignore[assignment]
        return voices.get(gender) or voices.get("female")  # type: ignore[union-attr]

    def native_honorific(self, honorific: str) -> str:
        """Honorific in the language's own script when known (a Marathi voice reads 'आई' properly, not Latin 'Aai')."""
        return self.honorifics_native.get(honorific, honorific)

    def say(self, key: str, **kw: str) -> str:
        if "honorific" in kw:
            kw = {**kw, "honorific": self.native_honorific(kw["honorific"])}
        return self.strings[key].format(**kw)

    def match_emergency(self, text: str) -> tuple[str, str] | None:
        """Keyword fast path. Returns (category, matched_phrase) or None."""
        t = _norm(text)
        for category, phrases in self.emergency_phrases.items():
            for p in phrases:
                if _norm(p) in t:
                    return category, p
        return None


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


@lru_cache
def load_registry() -> dict[str, Language]:
    raw = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    out: dict[str, Language] = {}
    for item in raw["languages"]:
        out[item["code"]] = Language(
            code=item["code"],
            status=item["status"],
            name=item["name"],
            native_name=item["native_name"],
            script=item["script"],
            stt=item["stt"],
            tts=item["tts"],
            honorifics=item["honorifics"],
            default_honorific=item["default_honorific"],
            strings=item["strings"],
            emergency_phrases=item.get("emergency_phrases", {}),
            honorifics_native=item.get("honorifics_native", {}),
        )
    return out


def get_language(code: str) -> Language:
    reg = load_registry()
    if code not in reg:
        raise KeyError(f"Unknown language '{code}'. Known: {sorted(reg)}")
    return reg[code]
