"""Weekly trends from the daily calls: mood, how much they talk, sleep, meals, medicine routine, blood pressure. Sneha reports what it
noticed and suggests a gentle check-in. It never diagnoses and never uses words like dementia or depression."""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

from loguru import logger

from .config import Settings
from .doses import week_start
from .llm import chat_json

MOOD_SCORE = {"good": 2.0, "okay": 1.0, "low": 0.0}
NOT_A_DIAGNOSIS = "This is a pattern Sneha noticed from the calls, not a diagnosis."


@dataclass
class Insight:
    kind: str
    severity: str  # info | watch | concern
    title: str
    body: str
    data: dict = field(default_factory=dict)


def _summary(call: dict) -> dict:
    cs = call.get("call_summaries")
    return (cs[0] if isinstance(cs, list) and cs else cs) or {}


def _words_per_turn(call: dict) -> float | None:
    turns = [t["text"] for t in call.get("call_turns") or [] if t.get("speaker") == "parent"]
    return statistics.mean(len(t.split()) for t in turns) if turns else None


def analyze(signals: dict, today: date) -> list[Insight]:
    """Deterministic part: numbers in, insights out. `signals` is CareStore.week_signals()."""
    now_cut = datetime.combine(today - timedelta(days=7), datetime.min.time(), tzinfo=UTC)
    recent_calls = [c for c in signals["calls"] if datetime.fromisoformat(c["started_at"]) >= now_cut]
    older_calls = [c for c in signals["calls"] if datetime.fromisoformat(c["started_at"]) < now_cut]
    out: list[Insight] = []

    def moods(cs: list[dict]) -> list[float]:
        return [MOOD_SCORE[m] for c in cs if (m := _summary(c).get("mood")) in MOOD_SCORE]

    rm, om = moods(recent_calls), moods(older_calls)
    if len(rm) >= 3 and len(om) >= 3:
        r, o = statistics.mean(rm), statistics.mean(om)
        lows = sum(1 for x in rm if x == 0)
        if r < 0.8 and lows >= 3:
            out.append(Insight("mood", "concern", "Mood has been low for several calls",
                               f"{lows} of the last {len(rm)} calls sounded low. A call or a visit this week would mean a lot. {NOT_A_DIAGNOSIS}", {"recent": round(r, 2), "before": round(o, 2)}))
        elif o - r >= 0.5:
            out.append(Insight("mood", "watch", "Mood is a little lower than usual",
                               f"Calls this week sounded quieter than the weeks before. A friendly call from you could help. {NOT_A_DIAGNOSIS}", {"recent": round(r, 2), "before": round(o, 2)}))
        elif r - o >= 0.4:
            out.append(Insight("mood", "info", "Spirits are up this week", "Calls this week sounded noticeably brighter than before.", {"recent": round(r, 2), "before": round(o, 2)}))

    rw = [w for c in recent_calls if (w := _words_per_turn(c)) is not None]
    ow = [w for c in older_calls if (w := _words_per_turn(c)) is not None]
    if len(rw) >= 3 and len(ow) >= 3 and statistics.mean(ow) > 0:
        drop = 1 - statistics.mean(rw) / statistics.mean(ow)
        if drop >= 0.35:
            out.append(Insight("engagement", "watch", "Replies have been shorter this week",
                               f"On average they are saying about {round(drop * 100)}% less per turn than in earlier weeks. They may be tired or low on energy. {NOT_A_DIAGNOSIS}",
                               {"recent_words": round(statistics.mean(rw), 1), "before_words": round(statistics.mean(ow), 1)}))

    poor = sum(1 for c in recent_calls if _summary(c).get("data", {}).get("slept") == "poorly")
    if poor >= 4:
        out.append(Insight("sleep", "watch", "Sleeping poorly most nights", f"They said they slept badly on {poor} of the last {len(recent_calls)} calls.", {"poor_nights": poor}))
    skipped = sum(1 for c in recent_calls if _summary(c).get("data", {}).get("ate") is False)
    if skipped >= 3:
        out.append(Insight("appetite", "watch", "Skipping meals", f"They had not eaten by the time of the call on {skipped} of the last {len(recent_calls)} days.", {"skipped": skipped}))

    cutoff = datetime.now(UTC)
    doses = [d for d in signals["doses"] if datetime.fromisoformat(d["due_at"]) >= now_cut and datetime.fromisoformat(d["due_at"]) <= cutoff]
    decided = [d for d in doses if d["status"] in ("taken", "missed")]
    if len(decided) >= 5:
        taken = sum(1 for d in decided if d["status"] == "taken")
        pct = round(100 * taken / len(decided))
        if pct < 50:
            out.append(Insight("adherence", "concern", "Many medicines were missed this week", f"Only {pct}% of doses were confirmed ({taken} of {len(decided)}). It may be worth checking the routine with them.", {"pct": pct}))
        elif pct < 75:
            out.append(Insight("adherence", "watch", "Some doses were missed", f"{pct}% of doses were confirmed this week ({taken} of {len(decided)}).", {"pct": pct}))
        elif pct == 100:
            out.append(Insight("adherence", "info", "Every dose confirmed this week", f"All {len(decided)} doses were confirmed. That is a very steady routine.", {"pct": pct}))

    bp = [v for v in signals["vitals"] if v["kind"] == "bp"]
    rb = [v["value"] for v in bp if datetime.fromisoformat(v["measured_at"]) >= now_cut]
    ob = [v["value"] for v in bp if datetime.fromisoformat(v["measured_at"]) < now_cut]
    if len(rb) >= 3 and len(ob) >= 3 and statistics.mean(rb) - statistics.mean(ob) >= 10:
        out.append(Insight("bp_trend", "watch", "Blood pressure readings are creeping up",
                           f"The top number averaged {statistics.mean(rb):.0f} this week, up from {statistics.mean(ob):.0f}. Worth mentioning to their doctor.",
                           {"recent": round(statistics.mean(rb)), "before": round(statistics.mean(ob))}))

    if not any(i.severity in ("watch", "concern") for i in out) and len(recent_calls) >= 3:
        out.append(Insight("steady", "info", "A steady week", f"{len(recent_calls)} calls this week and nothing unusual stood out.", {"calls": len(recent_calls)}))
    return out


REPEAT_SYSTEM = """You review several short phone-call transcripts between Sneha and one elderly person, oldest first.
Find ONLY this: the person asking the SAME question or telling the SAME fact again as if new, in different calls, or clearly not knowing today's day or who is
calling after being told. Be conservative: normal repeated greetings, favourite topics and stories do not count.
Return ONLY JSON: {"repeats": [{"what": "short description", "quote": "exact words they said", "calls": number_of_calls_it_appeared_in}]} (empty list if none)."""


async def repetition_insight(s: Settings, calls: list[dict]) -> Insight | None:
    texts: list[str] = []
    for c in calls[-4:]:
        parent = [t["text"] for t in c.get("call_turns") or [] if t.get("speaker") == "parent"]
        if parent:
            texts.append(f"CALL {c['started_at'][:10]}:\n" + "\n".join(parent[:25]))
    if len(texts) < 3 or not (s.groq_api_key and s.groq_model_summary):
        return None
    out = await chat_json(s, s.groq_model_summary, REPEAT_SYSTEM, "\n\n".join(texts), max_tokens=500)
    repeats = [r for r in out.get("repeats", []) if int(r.get("calls", 0)) >= 2 and r.get("quote")]
    if not repeats:
        return None
    r = repeats[0]
    return Insight("repetition", "watch", "Repeating the same thing across calls",
                   f"They brought up '{r.get('what', 'the same thing')}' again in {r['calls']} calls. This can happen when someone is tired or unwell; a relaxed check-in may be worth it. {NOT_A_DIAGNOSIS}",
                   {"quote": str(r["quote"])[:200]})


DIGEST_SYSTEM = """You write a warm weekly note from Sneha to an adult child ("you") about their parent, in {family_language}. 3 to 4 short sentences. Plain words.
Refer to the parent by the name in "parent" (for example Aai), never as "you". Use only the facts given and do not quote raw numbers like 0.43; say things like
"mostly cheerful" or "quieter than usual". Mention one lovely highlight if there is one. End with one gentle suggestion if anything was flagged, otherwise a warm
closing line. Never diagnose. Return ONLY JSON: {{"summary": "..."}}"""


async def weekly_digest(
    s: Settings, store: Any, parent_id: str, today: date, signals: dict, insights: list[Insight], family_language: str, parent_label: str = "your parent"
) -> dict | None:
    wk = week_start(today)
    recent = signals["calls"][-7:]
    highlights = [h for c in recent for h in (_summary(c).get("data", {}).get("highlights") or [])][:6]
    moods = [MOOD_SCORE[m] for c in recent if (m := _summary(c).get("mood")) in MOOD_SCORE]
    decided = [d for d in signals["doses"] if d["status"] in ("taken", "missed")]
    data = {
        "calls": len(recent),
        "avg_mood": round(statistics.mean(moods), 2) if moods else None,
        "adherence_pct": round(100 * sum(1 for d in decided if d["status"] == "taken") / len(decided)) if decided else None,
        "highlights": highlights,
        "insights": [i.title for i in insights],
    }
    summary = ""
    if s.groq_api_key and s.groq_model_summary and recent:
        try:
            avg = data["avg_mood"]
            mood_word = "no mood readings" if avg is None else "mostly cheerful" if avg >= 1.4 else "mixed" if avg >= 0.9 else "low"
            facts = {"parent": parent_label, "calls_this_week": data["calls"], "mood": mood_word, "doses_confirmed_pct": data["adherence_pct"], "highlights": highlights, "flagged": data["insights"]}
            out = await chat_json(s, s.groq_model_summary, DIGEST_SYSTEM.format(family_language=family_language), str(facts), max_tokens=350)
            summary = str(out.get("summary", ""))
        except Exception as e:  # noqa: BLE001 - a digest without prose is still useful
            logger.warning(f"digest prose failed: {e}")
    await store.save_digest(parent_id, wk, data, summary)
    return {**data, "summary": summary}


async def compute_for_parent(s: Settings, store: Any, parent_id: str, today: date) -> list[Insight]:
    signals = await store.week_signals(parent_id, today - timedelta(days=28))
    insights = analyze(signals, today)
    try:
        rep = await repetition_insight(s, signals["calls"])
        if rep:
            insights.append(rep)
    except Exception as e:  # noqa: BLE001 - the LLM check is a bonus on top of the numbers
        logger.warning(f"repetition check skipped: {e}")
    info = await store.family_ids_for(parent_id)
    who = info.get("honorific") or info.get("name") or "Your parent"
    wk = week_start(today)
    for i in insights:
        is_new = await store.save_insight(parent_id, i.kind, i.severity, i.title, i.body, i.data, wk)
        if is_new and i.severity == "concern":
            await store.notify_family(parent_id, "insight", f"{who}: {i.title}", i.body, {"url": "/insights"}, pref="summary")
    from .languages import load_registry

    lang = load_registry().get(info.get("family_language", "en"))
    await weekly_digest(s, store, parent_id, today, signals, insights, lang.name if lang else "English", who)
    return insights
