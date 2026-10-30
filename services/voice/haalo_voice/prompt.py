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
Introduce yourself honestly as Sneha, an AI assistant set up by {child_name}, and ask for their permission to call them every day for a short chat.
Say it warmly in two or three short sentences. Listen. When they answer, call record_consent(granted=true|false).
If they agree, say thank you and continue with a light friendly chat. If they refuse, thank them kindly and call end_call(reason="consent_declined").
"""


REMINDER_MODE = """
# This is a SHORT MEDICINE REMINDER call (about one minute), not the daily chat
Their family asked Sneha to remind them about:
{doses}
The first message you receive, "(call connected)", only means the phone was answered: it is not something the person said. Open with one warm sentence that introduces you:
you are Sneha from Heartline, calling on behalf of {child_name} about their medicine. Then ask if they have taken it.
- If they HAVE taken it: FIRST call confirm_dose(medicine, true) for each one they mention (in the same turn, before you say anything), THEN thank them, ask one quick friendly question (how are you feeling), then say goodbye and call end_call.
- If NOT YET: kindly encourage them to take it now, the way the doctor told them. Never say what dose or change anything. Say you will check again soon. Call confirm_dose(medicine, false). Then say goodbye and call end_call.
- If they say they cannot take it, feel unwell, or do not want to: do not push. Say you will let the family know. Then say goodbye and call end_call.
Do NOT run the full daily check-in. Three or four short exchanges in total.
"""

INBOUND_MODE = """
# They called YOU
They phoned Heartline and you answered, so do NOT say you are calling on anyone's behalf. They phoned Sneha, so help them. The first message you receive, "(call connected)", only means you picked up: greet them warmly in one short sentence, in their own language AND SCRIPT (never Latin letters for an Indian language), saying you are Sneha from Heartline, and ask how you can help. You can tell them: which medicines are due and whether each was already confirmed today, their upcoming appointments,
and messages from the family. You can listen, keep them company, and pass anything on to the family. If they feel unwell or ask for the family, take it
seriously: for an emergency say to dial 112, and call request_family_help so the family is alerted at once. Do not run the daily checklist.
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

    if session.purpose == "reminder":
        todo = [d for d in p.doses_today if d.event_id in session.dose_event_ids] or [d for d in p.doses_today if d.status != "taken"]
        lines = _bullets([f"{d.medicine}{', ' + d.dose_text if d.dose_text else ''} (due at {d.due_label})" for d in todo]) or "- their medicine"
        sections.insert(0, ("Reminder call", REMINDER_MODE.format(doses=lines, child_name=p.child_name).strip()))
    elif session.purpose == "inbound" or session.direction == "inbound":
        sections.insert(0, ("Inbound call", INBOUND_MODE.strip()))
        status = [f"{d.medicine} at {d.due_label}: {'already taken' if d.status == 'taken' else 'not yet confirmed'}" for d in p.doses_today]
        if status:
            sections.append(("Their medicine today", _bullets(status)))
    else:
        checklist: list[str] = []
        if p.doses_today:
            for d in p.doses_today:
                if d.status == "taken":
                    continue  # already confirmed (reminder call, photo, family): do not ask again
                checklist.append(f"Gently ask whether they have taken {d.medicine} (due {d.due_label}). If they say yes, call confirm_dose.")
        else:
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
        if p.vital_kinds:
            kinds = ", ".join({"bp": "blood pressure", "sugar": "blood sugar", "weight": "weight", "temperature": "temperature", "spo2": "oxygen level", "pulse": "pulse"}.get(k, k) for k in p.vital_kinds)
            checklist.append(f"They sometimes measure their {kinds}. Ask once, lightly, if they checked today. Repeat the numbers back, and only after they agree, call log_vital.")
        sections.append(("Today's checklist (weave in, one at a time)", _bullets(checklist)))

    if p.occasions:
        sections.insert(1, ("Today is special", _bullets(p.occasions)))
    if p.messages:
        lines = [
            (f"{m.from_name or 'A family member'} sent this message: \"{m.body}\" Pass it on warmly in your own words, saying who it is from."
             if m.kind == "note"
             else f"{m.from_name or 'A family member'} wants to know: \"{m.body}\" Ask them this naturally and listen to the answer.")
            for m in p.messages
        ]
        message_section = (
            "Messages from the family (deliver these NOW)",
            "The family left these for them. Right after they answer how they are, and before anything else on the checklist, bring them up warmly in their "
            "language, ONE at a time: say the message (or ask the question), then stop and listen to their reply. If you have not delivered them yet, do it "
            "in your very next reply.\n" + _bullets(lines),
        )
    if p.appointments:
        sections.append(("Upcoming appointments (remind them kindly, only AFTER any family messages have been delivered)", _bullets([f"{a.title}{' with ' + a.doctor if a.doctor else ''}, {a.when_text}" for a in p.appointments])))
    if p.refills:
        sections.append(("Medicine running low (mention only AFTER any family messages have been delivered)", f"Their supply of {', '.join(p.refills)} is running low. Tell them the family will arrange more; do not promise anything else."))

    if p.pinned_facts:
        sections.append(("Important things to remember", _bullets(p.pinned_facts)))
    if p.recent_summaries:
        sections.append(("Recent calls (newest first)", _bullets(p.recent_summaries[:3])))
    if p.memories:
        sections.append(("Other things you know about them", _bullets(p.memories[:15])))

    if p.messages:
        sections.append(message_section)  # last: models weight the end of the prompt most

    def render(secs: list[tuple[str, str]]) -> str:
        return persona + "\n\n" + "\n\n".join(f"# {h}\n{b}" for h, b in secs)

    prompt = render(sections)
    droppable = ["Other things you know about them", "Recent calls (newest first)"]
    while estimate_tokens(prompt) > budget_tokens and droppable:
        drop = droppable.pop(0)
        sections = [s for s in sections if s[0] != drop]
        prompt = render(sections)
    return prompt, version
