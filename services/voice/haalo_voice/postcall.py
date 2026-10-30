"""Post-call jobs: structured summary (GROQ_MODEL_SUMMARY), memories, follow-ups, pattern flags, family push."""

from __future__ import annotations

from loguru import logger

from .config import Settings
from .languages import get_language
from .llm import chat_json
from .session import CallSession
from .store import Store

SUMMARY_SYSTEM = """You extract structured facts from a phone call transcript between Sneha (an AI assistant) and an elderly parent.
Only use what is in the transcript. Never invent. If unsure use "unclear" / false / empty lists.
Return ONLY this JSON:
{
 "mood": "good|okay|low|unclear",
 "meds": [{"name": "...", "taken": true, "note": "..."}],
 "ate": true|false|null,
 "slept": "well|poorly|unclear",
 "complaints": ["short phrase, in English"],
 "highlights": ["short, warm, specific"],
 "follow_ups": ["things to ask about next call"],
 "new_facts": ["durable facts worth remembering, e.g. names, events, preferences"],
 "flags": [{"category": "...", "severity": "low|medium|high|emergency", "evidence_quote": "exact quote"}],
 "message_replies": [{"id": "the question id given below", "reply": "their answer, in English, one short sentence"}] (only for family questions that were asked and answered; else []),
 "delivered_message_ids": ["ids of the family messages (notes AND questions, listed below) that Sneha actually said or asked during the call; else []"],
 "story": null or {"title": "short title", "transcript": "the story the parent told, in their own words and language"} (ONLY if they told a memorable personal story worth keeping, e.g. about their childhood; otherwise null),
 "summary_for_family": "2-3 short, plain, warm sentences in {family_language}, written as a caring update to the adult child, e.g. 'Aai sounded cheerful and took her BP tablet.' No jargon like 'sentiment'."
}"""


def _transcript(session: CallSession) -> str:
    return "\n".join(f"{'PARENT' if t['speaker'] == 'parent' else 'SNEHA'}: {t['text']}" for t in session.turns)


async def run_post_call(session: CallSession, status: str, s: Settings, store: Store, family_language: str = "English") -> dict | None:
    p = session.profile
    log = logger.bind(call_id=session.call_id)
    if status == "no_response" or not session.turns:
        await _missed_notice(session, status, store)
        return None
    if session.purpose == "reminder":
        # A reminder call only confirms doses; the daily check-in writes the summary. The live confirm_dose tool does the work, and this
        # reads the transcript once more so a dose the parent clearly confirmed is never lost if the model forgot to call the tool.
        log.info(f"reminder call finished: {session.doses_confirmed}")
        await _reminder_safety_net(session, s, store)
        return None
    if not (s.groq_api_key and s.groq_model_summary):
        log.warning("summary skipped: GROQ_API_KEY / GROQ_MODEL_SUMMARY not set")
        return None

    system = SUMMARY_SYSTEM.replace("{family_language}", family_language)
    user = (
        f"Parent: {p.name} (addressed as {p.honorific}). Language spoken: {get_language(p.language).name}.\n"
        f"Medicines expected: {', '.join(m.name for m in p.medicines) or 'none listed'}.\n"
        + (
            "Family messages waiting for this call (id: kind: text):\n" + "\n".join(f"{m.id}: {m.kind}: {m.body}" for m in p.messages) + "\n"
            if p.messages
            else ""
        )
        + f"\nTRANSCRIPT:\n{_transcript(session)}"
    )
    summary = await chat_json(s, s.groq_model_summary, system, user, max_tokens=900)
    session.llm_tokens += int(summary.pop("_tokens", 0))
    if p.is_demo:
        log.info(f"demo call summary (not stored): {summary.get('summary_for_family', '')}")
        return summary
    # flags detected by the model here merge with live flags (dedupe by category)
    live = {f["category"] for f in session.flags}
    for f in summary.get("flags", []):
        if f.get("category") not in live and f.get("severity") in ("medium", "high", "emergency"):
            flag = {**f, "source": "summary"}
            session.flags.append(flag)
            await store.add_flag(session, flag)
    await store.save_summary(session, summary, s.groq_model_summary)

    # Family messages that were part of this call count as delivered once a real conversation happened; answers are saved for the sender.
    if p.messages:
        known = {m.id for m in p.messages}
        said = [i for i in summary.get("delivered_message_ids", []) if i in known]
        await store.deliver_messages(said, session.call_id)
        await store.save_message_replies([r for r in summary.get("message_replies", []) if r.get("id") in said])
    # Safety net: a medicine the parent said they took that the live tool did not catch.
    already = {d["medicine"].lower() for d in session.doses_confirmed if d["taken"]}
    for m in summary.get("meds", []):
        if m.get("taken") and m.get("name") and m["name"].lower() not in already:
            await store.confirm_dose(p.parent_id, m["name"], p.timezone, via="call", call_id=session.call_id)

    # patterns across calls: same complaint 3 times in 7 days raises a medium flag
    counts = await store.recent_flag_counts(p.parent_id, 7)
    for complaint in summary.get("complaints", []):
        if counts.get(complaint.lower().strip(), 0) >= 3:
            flag = {"category": "recurring_complaint", "severity": "medium", "evidence_quote": complaint, "source": "pattern"}
            await store.add_flag(session, flag)
            await store.notify_family(
                p.parent_id, "flag", f"{p.honorific} has mentioned {complaint} several times",
                f"{complaint} has come up 3 times this week. It may be worth a call or a doctor visit.",
                {"call_id": session.call_id, "flag_category": "recurring_complaint", "url": "/alerts"}, pref="summary",
            )

    await store.notify_family(
        p.parent_id, "summary", f"{p.honorific} called Sneha" if session.purpose == "inbound" else f"{p.honorific}'s call today", summary.get("summary_for_family", ""),
        {"call_id": session.call_id, "mood": summary.get("mood"), "url": f"/calls/{session.call_id}"}, pref="summary",
    )
    log.info("post-call summary saved")
    return summary


_REMINDER_NET = """You read a short phone call where Sneha reminded an elderly person about medicines. Return ONLY JSON {"taken": ["medicine names"]}:
list the medicines from the given list that the person CLEARLY said they have already taken (a plain yes counts for the medicines Sneha asked about).
Do not include medicines they said they have not taken yet, or anything unclear."""


async def _reminder_safety_net(session: CallSession, s: Settings, store: Store) -> None:
    p = session.profile
    if p.is_demo or not (s.groq_api_key and s.groq_model_fast):
        return
    done = {d["medicine"].lower() for d in session.doses_confirmed if d["taken"]}
    todo = [d for d in p.doses_today if d.event_id in session.dose_event_ids and d.status != "taken" and d.medicine.lower() not in done]
    if not todo or len(session.turns) < 3:
        return
    try:
        out = await chat_json(
            s, s.groq_model_fast, _REMINDER_NET,
            f"Medicines: {', '.join(sorted({d.medicine for d in todo}))}\n\nTRANSCRIPT:\n{_transcript(session)}", max_tokens=150,
        )
    except Exception as e:  # noqa: BLE001 - the safety net must never break call cleanup
        logger.warning(f"reminder safety net failed: {e}")
        return
    for name in out.get("taken", []):
        hit = await store.confirm_dose(p.parent_id, str(name), p.timezone, via="reminder_call", call_id=session.call_id)
        if hit:
            session.emit("action", f"Dose confirmed: {hit['medicine']}")
            await store.notify_family(p.parent_id, "dose", f"{p.honorific} took {hit['medicine']}", "Confirmed on Sneha's reminder call.", {"call_id": session.call_id, "url": "/medicines"}, pref="summary")


async def _missed_notice(session: CallSession, status: str, store: Store) -> None:
    p = session.profile
    if p.is_demo:
        return
    missed = await store.consecutive_missed_days(p.parent_id)
    if missed >= 2:
        await store.notify_family(
            p.parent_id, "missed", f"{p.honorific} hasn't picked up for {missed} days",
            "Sneha couldn't reach them on the last calls. It may be worth calling directly.",
            {"call_id": session.call_id}, pref="missed",
        )
