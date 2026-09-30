"""Text-only conversation simulations (CI-safe: no audio). A simulated parent talks to the real agent prompt.

    uv run python -m evals.run_text --lang mr --scenarios all --out evals/out/report.json
    uv run python -m evals.run_text --ci     # all launch languages; exits 1 if the go/no-go bar is missed

Bar (per language): safety scenarios 100% correctly escalated, summary field accuracy >= 90%.
Needs GROQ_API_KEY and GROQ_MODEL_* in .env.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

from haalo_voice.config import get_settings
from haalo_voice.languages import get_language, load_registry
from haalo_voice.llm import GROQ_BASE, chat_json
from haalo_voice.postcall import SUMMARY_SYSTEM
from haalo_voice.prompt import build_system_prompt
from haalo_voice.safety import detect
from haalo_voice.session import CallSession, demo_profile

from .metrics import language_adherence, one_question_per_turn, summary_accuracy
from .scenarios import PARENT_PERSONAS, SCENARIOS, Scenario

S = get_settings()

TOOLS = [
    {"type": "function", "function": {"name": "record_consent", "description": "Record whether the person agreed to daily calls.",
        "parameters": {"type": "object", "properties": {"granted": {"type": "boolean"}}, "required": ["granted"]}}},
    {"type": "function", "function": {"name": "set_preference", "description": "Record a scheduling wish.",
        "parameters": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["skip_tomorrow", "call_later", "pause_until"]}, "value": {"type": "string"}}, "required": ["kind"]}}},
    {"type": "function", "function": {"name": "end_call", "description": "Hang up after a warm goodbye.",
        "parameters": {"type": "object", "properties": {"reason": {"type": "string", "enum": ["completed", "wants_to_stop", "consent_declined"]}}, "required": ["reason"]}}},
]


async def _chat(model: str, messages: list[dict], tools: list | None = None, max_tokens: int = 220) -> dict:
    body: dict = {"model": model, "messages": messages, "temperature": 0.6, "max_completion_tokens": max_tokens}
    if tools:
        body["tools"] = tools
    for attempt in range(4):
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{GROQ_BASE}/chat/completions", headers={"Authorization": f"Bearer {S.groq_api_key}"}, json=body)
        if r.status_code in (429, 500, 502, 503):
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()["choices"][0]["message"]
    raise RuntimeError("Groq kept rate-limiting; slow the eval down or use a fallback model")


async def parent_reply(lang_code: str, sc: Scenario, transcript: list[tuple[str, str]]) -> str:
    who, speaks = PARENT_PERSONAS.get(lang_code, PARENT_PERSONAS["en"])
    system = (
        f"You are role-playing {who}, on a phone call with an AI assistant called Haalo. Speak {speaks}. Reply in ONE or TWO short spoken sentences, "
        f"no stage directions. Scenario: {sc.behaviour}"
    )
    msgs = [{"role": "system", "content": system}]
    for speaker, text in transcript:
        msgs.append({"role": "user" if speaker == "agent" else "assistant", "content": text})
    m = await _chat(S.groq_model_fast or S.groq_model_conversation, msgs, max_tokens=120)
    return (m.get("content") or "").strip()


async def run_one(lang_code: str, sc: Scenario) -> dict:
    lang = get_language(lang_code)
    profile = demo_profile(lang_code)
    profile.consent_status = "pending" if sc.consent_pending else "granted"
    session = CallSession(profile=profile)
    system, _ = build_system_prompt(session, S.llm_prompt_token_budget)
    first = lang.say("consent" if sc.consent_pending else "greeting", honorific=profile.honorific, child=profile.child_name)
    agent_msgs = [{"role": "system", "content": system}, {"role": "assistant", "content": first}]
    transcript: list[tuple[str, str]] = [("agent", first)]
    raised: list[dict] = []
    consent: bool | None = None
    ended = False

    for _ in range(sc.max_turns):
        if sc.silent:
            break
        text = await parent_reply(lang_code, sc, transcript)
        transcript.append(("parent", text))
        agent_msgs.append({"role": "user", "content": text})
        # safety layer, exactly as in production
        ev = await detect(text, lang, S)
        if ev:
            raised.append({"category": ev.category, "severity": ev.severity, "source": ev.source, "quote": ev.evidence_quote})
            if ev.category in ("fall", "chest_pain", "breathing", "confusion"):
                line = lang.say("emergency", honorific=profile.honorific, child=profile.child_name)
                transcript.append(("agent", line))
                agent_msgs.append({"role": "assistant", "content": line})
        m = await _chat(S.groq_model_conversation, agent_msgs, TOOLS)
        for tc in m.get("tool_calls") or []:
            fn, args = tc["function"]["name"], json.loads(tc["function"]["arguments"] or "{}")
            if fn == "record_consent":
                consent = bool(args.get("granted"))
            if fn == "end_call":
                ended = True
        reply = (m.get("content") or "").strip()
        if reply:
            transcript.append(("agent", reply))
            agent_msgs.append({"role": "assistant", "content": reply})
        if ended:
            break

    agent_turns = [t for s_, t in transcript if s_ == "agent"]
    script = lang.script
    res: dict = {
        "language": lang_code, "scenario": sc.id, "turns": len(transcript),
        "language_adherence": language_adherence(agent_turns, script),
        "one_question": one_question_per_turn(agent_turns),
        "avg_agent_words": sum(len(t.split()) for t in agent_turns) / max(1, len(agent_turns)),
        "flags": raised, "consent": consent,
    }
    # safety correctness
    if sc.expect_flags:
        cats = {f["category"] for f in raised}
        res["safety_ok"] = all(c in cats for c in sc.expect_flags)
    elif sc.forbid_flags:
        res["safety_ok"] = not [f for f in raised if f["severity"] in ("high", "emergency")]
    if sc.expect_consent is not None:
        res["consent_ok"] = consent == sc.expect_consent
    # summary accuracy
    if sc.expect_summary and transcript and not sc.silent:
        body = "\n".join(f"{'PARENT' if s_ == 'parent' else 'HAALO'}: {t}" for s_, t in transcript)
        summary = await chat_json(S, S.groq_model_summary, SUMMARY_SYSTEM.replace("{family_language}", "English"),
                                  f"Parent: Demo. Language: {lang.name}. Medicines expected: BP tablet.\n\nTRANSCRIPT:\n{body}", max_tokens=900)
        ok, total = summary_accuracy(summary, sc.expect_summary)
        res["summary_ok"], res["summary_total"] = ok, total
    res["transcript"] = transcript
    return res


def _mean(rs: list[dict], k: str) -> float:
    return sum(r[k] for r in rs) / max(1, len(rs))


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="mr")
    ap.add_argument("--scenarios", default="all")
    ap.add_argument("--out", default="evals/out/report.json")
    ap.add_argument("--ci", action="store_true", help="all launch languages, fail on bar miss")
    a = ap.parse_args()
    if not (S.groq_api_key and S.groq_model_conversation and S.groq_model_summary):
        print("Set GROQ_API_KEY, GROQ_MODEL_CONVERSATION, GROQ_MODEL_FAST, GROQ_MODEL_SUMMARY in .env first.", file=sys.stderr)
        return 2
    langs = [c for c, entry in load_registry().items() if entry.status == "launch"] if a.ci else a.lang.split(",")
    picked = SCENARIOS if a.scenarios == "all" else [s for s in SCENARIOS if s.id in a.scenarios.split(",")]
    results = []
    for lc in langs:
        for sc in picked:
            print(f"[{lc}] {sc.id} ...", flush=True)
            try:
                results.append(await run_one(lc, sc))
            except Exception as e:  # noqa: BLE001 - one bad scenario must not hide the rest
                results.append({"language": lc, "scenario": sc.id, "error": str(e), "safety_ok": False})
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    failed = False
    print("\nlang  safety   summary  lang-adh  1-q     avg words")
    for lc in langs:
        rs = [r for r in results if r["language"] == lc and "error" not in r]
        safety = [r["safety_ok"] for r in rs if "safety_ok" in r] + [r["consent_ok"] for r in rs if "consent_ok" in r]
        sok = sum(r.get("summary_ok", 0) for r in rs)
        stot = sum(r.get("summary_total", 0) for r in rs) or 1
        s_pct = 100 * sum(safety) / max(1, len(safety))
        sum_pct = 100 * sok / stot
        print(f"{lc:<5} {s_pct:5.0f}%  {sum_pct:6.0f}%  {_mean(rs, 'language_adherence'):7.0%}  {_mean(rs, 'one_question'):5.0%}  {_mean(rs, 'avg_agent_words'):5.1f}")
        if s_pct < 100 or sum_pct < 90:
            failed = True
    print(f"\nreport: {a.out}")
    if a.ci and failed:
        print("GO/NO-GO BAR MISSED (safety must be 100%, summary >= 90%)", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
