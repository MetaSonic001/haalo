"""System prompt assembly. Stable prefix first (persona + rules) so provider prefix-caching works;
per-parent, per-call parts after. Trimmed to a token budget by dropping the least valuable parts first."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .languages import get_language
from .session import CallSession

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache
def persona_template() -> tuple[str, str]:
    text = (PROMPTS_DIR / "persona.md").read_text(encoding="utf-8")
    version = text.split("persona_version:")[1].split("-->")[0].strip() if "persona_version:" in text else "unknown"
    return text, version


def estimate_tokens(text: str) -> int:
    """Conservative: Latin ~4 chars/token, Indic scripts ~1.5 chars/token."""
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    return ascii_chars // 4 + int((len(text) - ascii_chars) / 1.5) + 1


CONSENT_MODE = """
# This is the FIRST call. Your only job right now
Introduce yourself honestly as Haalo, an AI assistant set up by {child_name}, and ask for their permission to call them every day for a short chat.
Say it warmly in two or three short sentences. Listen. When they answer, call record_consent(granted=true|false).
If they agree, say thank you and continue with a light friendly chat. If they refuse, thank them kindly and call end_call(reason="consent_declined").
"""


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {i}" for i in items)


def build_system_prompt(session: CallSession, budget_tokens: int = 3500) -> tuple[str, str]:
    """Returns (prompt, persona_version)."""
    p = session.profile
    lang = get_language(p.language)
    template, version = persona_template()
    persona = (
        template.replace("{child_name}", p.child_name)
        .replace("{language_name}", lang.name)
        .replace("{language_native}", lang.native_name)
        .replace("{parent_name}", p.name)
        .replace("{honorific}", lang.native_honorific(p.honorific))
        .replace("{script}", lang.script)
        .replace("{next_call_time}", p.next_call_time)
    )

    # Ordered by value; the tail is dropped first when over budget.
    sections: list[tuple[str, str]] = []
    profile_lines = [f"Name: {p.name}. Address as: {p.honorific}. Language: {lang.name}."]
    if p.dialect:
        profile_lines.append(f"Dialect / region: {p.dialect}.")
    if p.interests:
        profile_lines.append(f"Loves talking about: {', '.join(p.interests)}.")
    if p.family_names:
        profile_lines.append("Family: " + ", ".join(f"{k} {v}" for k, v in p.family_names.items()) + ".")
    if p.doctor_names:
        profile_lines.append(f"Doctors: {', '.join(p.doctor_names)}.")
    sections.append(("About the person you are calling", _bullets(profile_lines)))

    if p.consent_status != "granted":
        sections.insert(0, ("First call", CONSENT_MODE.format(child_name=p.child_name).strip()))

    checklist: list[str] = []
    for m in p.medicines:
        when = f" ({', '.join(m.times)})" if m.times else ""
        checklist.append(f"Gently ask whether they have taken {m.name}{when}.")
    checklist += [f"Follow up: {f}" for f in p.follow_ups]
    checklist += [
        "Ask if they have eaten today.",
        "Ask how they slept.",
        "Ask if any pain or discomfort, and how their mood is.",
        "Ask what they plan to do today.",
    ]
    if session.direction == "inbound":
        checklist.insert(0, "They called YOU. Greet them and ask how you can help or just chat.")
    sections.append(("Today's checklist (weave in, one at a time)", _bullets(checklist)))

    if p.pinned_facts:
        sections.append(("Important things to remember", _bullets(p.pinned_facts)))
    if p.recent_summaries:
        sections.append(("Recent calls (newest first)", _bullets(p.recent_summaries[:3])))
    if p.memories:
        sections.append(("Other things you know about them", _bullets(p.memories[:15])))

    def render(secs: list[tuple[str, str]]) -> str:
        return persona + "\n\n" + "\n\n".join(f"# {h}\n{b}" for h, b in secs)

    prompt = render(sections)
    droppable = ["Other things you know about them", "Recent calls (newest first)"]
    while estimate_tokens(prompt) > budget_tokens and droppable:
        drop = droppable.pop(0)
        sections = [s for s in sections if s[0] != drop]
        prompt = render(sections)
    return prompt, version
