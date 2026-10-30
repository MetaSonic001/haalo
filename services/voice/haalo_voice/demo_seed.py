"""Seed (and reset) the demo workspace: one family, three parents in three languages, a month of calls, doses, vitals, alerts and messages.

    cd services/voice && uv run python -m haalo_voice.demo_seed

Everything is made up. Phone numbers are fictional (+91 90000 000xx) and the parents are flagged is_demo, so the scheduler never dials them.
The data is relative to 'now', so run it again before a demo and the dashboard always looks current.
"""

from __future__ import annotations

import asyncio
import io
import random
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from .config import Settings, get_settings

IST = ZoneInfo("Asia/Kolkata")
NS = uuid.UUID("6b1f7c5e-0a53-4c19-9d3e-5d7a2f0c9a11")
DEMO_USER, DEMO_USER2 = "demo-user", "demo-aditya"


def uid(*parts: str) -> str:
    return str(uuid.uuid5(NS, "/".join(parts)))


FAMILY_ID = uid("family")

# ---------------------------------------------------------------------------------- language flavour for the transcripts
FLAVOUR = {
    "mr": {
        "agent_open": "नमस्कार आई, मी स्नेहा. आज कसं वाटतंय?",
        "agent_more": ["अरे वा, छान! आणि जेवण झालं का?", "औषध घेतलंत का आज?", "रात्री झोप कशी लागली?", "आज काय करणार आहात?"],
        "parent": ["छान आहे रे", "आज सकाळी देवळात गेले होते", "शोभा काकू बरोबर", "चहा घेतला आणि पोहे खाल्ले", "औषध घेतलं", "भजन ऐकत होते", "रात्री छान झोप लागली", "बागेत फुलं लावली", "आरवचा अभ्यास कसा चाललाय", "थोडं गुडघं दुखतंय"],
        "closing": "ठीक आहे आई, उद्या पुन्हा बोलू. काळजी घ्या.",
    },
    "ta": {
        "agent_open": "வணக்கம் அப்பா, நான் ஸ்னேஹா. இன்று எப்படி இருக்கிறீர்கள்?",
        "agent_more": ["சாப்பிட்டீர்களா?", "மாத்திரை எடுத்துக்கொண்டீர்களா?", "நேற்று இரவு நன்றாக தூங்கினீர்களா?", "இன்று என்ன செய்யப்போகிறீர்கள்?"],
        "parent": ["நான் நன்றாக இருக்கிறேன்", "காலையில் நடைப்பயிற்சி போனேன்", "மாத்திரை சாப்பிட்டேன்", "இட்லி சாப்பிட்டேன்", "பேரன் போன் செய்தான்", "தொலைக்காட்சி பார்த்தேன்", "பக்கத்து வீட்டு மாமாவோடு பேசினேன்", "கோவிலுக்கு போய்விட்டு வந்தேன்", "செய்தித்தாள் படித்தேன்", "கொஞ்சம் சோர்வாக இருக்கிறது"],
        "closing": "சரி அப்பா, நாளை மீண்டும் பேசுவோம். கவனமாக இருங்கள்.",
    },
    "hi": {
        "agent_open": "नमस्ते दादी जी, मैं स्नेहा हूँ. आज कैसा लग रहा है?",
        "agent_more": ["खाना खा लिया आपने?", "दवाई ले ली आज?", "रात को नींद कैसी आई?", "आज क्या करने का सोचा है?"],
        "parent": ["मैं ठीक हूँ बेटा", "सुबह मंदिर गई थी", "दवाई ले ली", "पोहा खाया था", "पोती से बात हुई", "थोड़ी देर टीवी देखा", "पड़ोस की शर्मा आंटी आई थीं", "आज मौसम अच्छा है", "भजन सुन रही थी"],
        "closing": "ठीक है दादी जी, कल फिर बात करेंगे. अपना ख्याल रखिए.",
    },
}


def at(days_ago: float, hour: int, minute: int = 0) -> datetime:
    """UTC datetime for `hour:minute` IST, `days_ago` days back (relative to today's IST date)."""
    today = datetime.now(IST).date()
    local = datetime.combine(today - timedelta(days=int(days_ago)), datetime.min.time(), tzinfo=IST).replace(hour=hour, minute=minute)
    return local.astimezone(UTC)


def iso(d: datetime) -> str:
    return d.isoformat()


def chunks(rows: list, n: int = 400):
    for i in range(0, len(rows), n):
        yield rows[i : i + n]


# ---------------------------------------------------------------------------------- people
PARENTS = [
    {
        "key": "aai", "name": "Shobha Kulkarni", "honorific": "Aai", "language": "mr", "dialect": "Pune", "phone": "+919000000001", "gender": "female",
        "tradition": "hindu", "birthday": "1957-03-14", "child": "Rohan", "window": ("09:00", "10:30"),
        "interests": ["bhajans", "gardening", "Aarav's cricket", "Marathi natya sangeet"], "family_names": {"grandson": "Aarav", "neighbour": "Shobha kaku", "son": "Aditya"},
        "doctors": ["Dr. Deshmukh"], "vocab": ["आरव", "पुरणपोळी", "बाकरवडी", "गुडघा", "औषध", "गोळी", "बीपी", "शोभा काकू", "कोथरूड", "Amlodipine", "Metformin"],
        "meds": [("BP tablet", "Amlodipine 5 mg", ["morning"], True, 24, 1, "Blood pressure"), ("Metformin", "500 mg", ["morning", "evening"], False, 9, 1, "Sugar"), ("Calcium", "1 tablet", ["evening"], False, 40, 1, "Bones")],
        "history_days": 30, "style": "steady",
    },
    {
        "key": "appa", "name": "Ramaswamy Iyer", "honorific": "Appa", "language": "ta", "dialect": "Chennai", "phone": "+919000000002", "gender": "male",
        "tradition": "hindu", "birthday": "1953-09-02", "child": "Rohan", "window": ("08:30", "10:00"),
        "interests": ["carnatic music", "newspaper", "his grandson", "morning walk"], "family_names": {"grandson": "Karthik", "son": "Venkat"},
        "doctors": ["Dr. Subramanian"], "vocab": ["Mylapore", "Metoprolol", "Thyroxine"],
        "meds": [("Metoprolol", "25 mg", ["morning", "night"], True, 31, 1, "Heart and BP"), ("Thyroxine", "50 mcg", ["fasting"], False, 18, 1, "Thyroid")],
        "history_days": 30, "style": "declining",
    },
    {
        "key": "dadi", "name": "Kamla Sharma", "honorific": "Dadi ji", "language": "hi", "dialect": "Lucknow", "phone": "+919000000003", "gender": "female",
        "tradition": "hindu", "birthday": "1949-12-20", "child": "Rohan", "window": ("10:00", "11:30"),
        "interests": ["bhajan", "pooja", "her grandchildren", "serials"], "family_names": {"granddaughter": "Anaya"},
        "doctors": [], "vocab": ["Aminabad"],
        "meds": [("Thyroid tablet", "1 tablet", ["morning"], False, 14, 1, "Thyroid")],
        "history_days": 9, "style": "steady",
    },
]


def mood_for(style: str, d: int, rng: random.Random) -> str:
    if style == "declining" and d <= 6:
        return rng.choice(["low", "low", "okay", "low", "low", "okay"])
    r = rng.random()
    return "good" if r < 0.62 else "okay" if r < 0.95 else "low"


def parent_text(lang: str, words: int, rng: random.Random) -> str:
    frags = FLAVOUR[lang]["parent"]
    out: list[str] = []
    while sum(len(x.split()) for x in out) < words:
        f = rng.choice(frags)
        if f not in out:
            out.append(f)
    return ". ".join(out) + "."


def family_summary(p: dict, mood: str, took: bool, ate: bool, slept: str, complaint: str | None) -> str:
    h = p["honorific"]
    tone = {"good": f"{h} sounded cheerful", "okay": f"{h} sounded fine, a little quiet", "low": f"{h} sounded low and tired today"}[mood]
    meds = "took the tablets" if took else "had not taken the morning tablet yet"
    meal = "had eaten" if ate else "had not eaten yet"
    bits = [f"{tone} and {meds}.", f"{h} {meal} and {'slept well' if slept == 'well' else 'slept badly'}."]
    if complaint:
        bits.append(f"{complaint.capitalize()} came up again; Sneha will ask tomorrow.")
    return " ".join(bits)


# ---------------------------------------------------------------------------------- the seed
def seed(s: Settings | None = None) -> dict:
    from supabase import create_client

    s = s or get_settings()
    if not (s.supabase_url and s.supabase_service_role_key):
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    db = create_client(s.supabase_url, s.supabase_service_role_key)
    rng = random.Random(20261025)
    now = datetime.now(UTC)
    local_now = datetime.now(IST)

    # ---- wipe the previous demo workspace (cascades to parents, calls, doses, vitals ...)
    try:
        old = db.storage.from_("proofs").list(FAMILY_ID)
        for folder in old or []:
            files = db.storage.from_("proofs").list(f"{FAMILY_ID}/{folder['name']}")
            if files:
                db.storage.from_("proofs").remove([f"{FAMILY_ID}/{folder['name']}/{f['name']}" for f in files])
    except Exception:  # noqa: BLE001 - nothing to clean up on a first run
        pass
    db.table("families").delete().eq("id", FAMILY_ID).execute()
    db.table("profiles").delete().in_("id", [DEMO_USER, DEMO_USER2]).execute()

    # ---- family
    db.table("profiles").insert([
        {"id": DEMO_USER, "full_name": "Rohan Kulkarni", "app_language": "en"},
        {"id": DEMO_USER2, "full_name": "Aditya Kulkarni", "app_language": "en"},
    ]).execute()
    db.table("families").insert({"id": FAMILY_ID, "name": "Rohan's family", "created_by": DEMO_USER}).execute()
    db.table("family_members").insert([
        {"family_id": FAMILY_ID, "user_id": DEMO_USER, "role": "owner", "alert_prefs": {"emergency": True, "summary": True, "missed": True}},
        {"family_id": FAMILY_ID, "user_id": DEMO_USER2, "role": "member", "alert_prefs": {"emergency": True, "summary": False, "missed": True}},
    ]).execute()

    totals = {"calls": 0, "doses": 0, "vitals": 0}
    ids: dict[str, str] = {}
    for p in PARENTS:
        pid = uid("parent", p["key"])
        ids[p["key"]] = pid
        _seed_parent(db, p, pid, rng, now, local_now, totals)

    _seed_family_level(db, ids, rng, now)
    _seed_proofs(db, ids)
    _seed_insights(db, ids, s)
    totals["parents"] = len(PARENTS)
    return {"family_id": FAMILY_ID, "parent_ids": ids, **totals}


def _seed_parent(db, p: dict, pid: str, rng: random.Random, now: datetime, local_now: datetime, totals: dict) -> None:
    lang, key = p["language"], p["key"]
    db.table("parents").insert({
        "id": pid, "family_id": FAMILY_ID, "name": p["name"], "phone_e164": p["phone"], "language": lang, "dialect": p["dialect"], "honorific": p["honorific"],
        "child_name": p["child"], "voice_gender": "female", "consent_status": "granted", "consent_at": iso(at(p["history_days"] + 1, 10)),
        "tradition": p["tradition"], "birthday": p["birthday"], "created_by": DEMO_USER, "is_demo": True, "created_at": iso(at(p["history_days"] + 2, 10)),
        "vital_ranges": {},
    }).execute()
    db.table("parent_context").insert({
        "parent_id": pid, "interests": p["interests"], "family_names": p["family_names"], "doctor_names": p["doctors"], "vocab": p["vocab"],
    }).execute()
    db.table("call_schedules").insert({
        "parent_id": pid, "window_start": p["window"][0], "window_end": p["window"][1], "days_of_week": [0, 1, 2, 3, 4, 5, 6],
    }).execute()

    meds_rows, med_ids = [], {}
    for name, dose, times, critical, stock, ppd, purpose in p["meds"]:
        mid = uid("med", key, name)
        med_ids[name] = (mid, times, critical)
        meds_rows.append({"id": mid, "parent_id": pid, "name": name, "dose_text": dose, "times": times, "critical": critical, "stock_count": stock, "pills_per_dose": ppd, "purpose": purpose})
    db.table("medicines").insert(meds_rows).execute()

    # ---- daily calls, summaries, turns
    calls, summaries, turns, memories = [], [], [], []
    first_hour = int(p["window"][0][:2])
    first_min = int(p["window"][0][3:])
    flavour = FLAVOUR[lang]
    for d in range(p["history_days"], -1, -1):
        if d == 0 and local_now.hour * 60 + local_now.minute < first_hour * 60 + first_min + 12:
            continue  # today's call has not happened yet
        mood = mood_for(p["style"], d, rng)
        miss = p["style"] == "declining" and d <= 6 and rng.random() < 0.45
        ate = rng.random() > (0.45 if (p["style"] == "declining" and d <= 6) else 0.05)
        slept = "poorly" if (p["style"] == "declining" and d <= 6 and rng.random() < 0.7) or rng.random() < 0.12 else "well"
        complaint = "knee pain" if key == "aai" and d in (0, 1, 2, 4, 5) else ("feeling tired" if key == "appa" and d <= 5 else None)
        start = at(d, first_hour, first_min + rng.randint(0, 6))
        dur = rng.randint(310, 420) if mood != "low" else rng.randint(150, 250)
        cid = uid("call", key, str(d))
        calls.append({
            "id": cid, "parent_id": pid, "direction": "outbound", "purpose": "checkin", "status": "completed", "scheduled_for": iso(at(d, first_hour, first_min)),
            "started_at": iso(start), "ended_at": iso(start + timedelta(seconds=dur)), "duration_s": dur, "provider": "twilio", "language": lang,
            "stt_provider": "groq_whisper", "tts_provider": "sarvam", "llm_model": s_model(), "latency_p50_ms": rng.randint(620, 810), "latency_p95_ms": rng.randint(1000, 1350),
            "end_reason": "completed", "created_at": iso(start),
            "cost_breakdown": {"total": round(dur / 60 * 1.1, 2), "telephony_minutes": round(dur / 60, 2)},
        })
        data = {
            "mood": mood, "meds": [{"name": m[0], "taken": not miss} for m in p["meds"][:1]], "ate": ate, "slept": slept,
            "complaints": [complaint] if complaint else [], "highlights": [rng.choice(p["interests"]).capitalize() + " came up"], "follow_ups": [], "new_facts": [], "flags": [],
            "summary_for_family": family_summary(p, mood, not miss, ate, slept, complaint),
        }
        summaries.append({"call_id": cid, "data": data, "summary_for_family": data["summary_for_family"], "mood": mood, "model": s_model(), "created_at": iso(start + timedelta(seconds=dur + 20))})
        # turns: a handful per call; parent word count follows the mood/trend so the engagement insight is real
        quiet = p["style"] == "declining" and d <= 6
        n_turns = 4 if d > 2 else 6
        t = 0
        turns.append({"call_id": cid, "speaker": "agent", "text": flavour["agent_open"], "started_ms": t})
        for i in range(n_turns):
            t += 6000
            turns.append({"call_id": cid, "speaker": "parent", "text": parent_text(lang, rng.randint(3, 5) if quiet else rng.randint(10, 15), rng), "started_ms": t, "latency_ms": rng.randint(620, 840)})
            t += 5000
            turns.append({"call_id": cid, "speaker": "agent", "text": flavour["agent_more"][i % len(flavour["agent_more"])], "started_ms": t})
        turns.append({"call_id": cid, "speaker": "agent", "text": flavour["closing"], "started_ms": t + 4000})
        if d == 0 or (key == "aai" and d == 3):
            memories.append((cid, start))
    for part in chunks(calls):
        db.table("calls").insert(part).execute()
    for part in chunks(summaries):
        db.table("call_summaries").insert(part).execute()
    for part in chunks(turns):
        db.table("call_turns").insert(part).execute()
    totals["calls"] += len(calls)

    # ---- dose history
    doses = []
    from .doses import dose_datetimes

    for d in range(p["history_days"], -1, -1):
        day = (local_now - timedelta(days=d)).date()
        for _name, (mid, times, _critical) in med_ids.items():
            for due in dose_datetimes(times, day, "Asia/Kolkata"):
                if due > now + timedelta(hours=6):
                    status, via, conf = "pending", None, None
                elif due > now:
                    status, via, conf = "pending", None, None
                else:
                    bad = p["style"] == "declining" and d <= 6 and rng.random() < 0.5
                    rare = rng.random() < 0.04
                    if bad or rare:
                        status, via, conf = "missed", None, None
                    else:
                        status = "taken"
                        via = rng.choices(["call", "reminder_call", "photo", "inbound"], [0.62, 0.3, 0.05, 0.03])[0]
                        conf = iso(due + timedelta(minutes=rng.randint(2, 40)))
                doses.append({
                    "parent_id": pid, "medicine_id": mid, "due_at": iso(due), "status": status, "confirmed_via": via, "confirmed_at": conf,
                    "reminder_attempts": 0 if status == "taken" and via == "call" else (1 if status == "taken" else 2), "created_at": iso(due - timedelta(hours=2)),
                })
    # today's morning doses: already confirmed if the check-in has happened, else still pending
    for part in chunks(doses):
        # upsert: the voice service's care tick may already have created today's events for these medicines
        db.table("dose_events").upsert(part, on_conflict="medicine_id,due_at").execute()
    totals["doses"] += len(doses)

    # ---- vitals
    vitals = []
    for d in range(p["history_days"], -1, -1):
        if key == "dadi" or d % 2:
            continue
        when = at(d, first_hour, first_min + 9)
        if when > now:
            continue
        if key == "aai":
            sys, dia = (168, 104) if d == 8 else (rng.randint(121, 134), rng.randint(78, 86))
            vitals.append({"parent_id": pid, "kind": "bp", "value": sys, "value2": dia, "unit": "mmHg", "context": "", "source": "call", "flagged": d == 8, "measured_at": iso(when)})
            sugar = 262 if d == 14 else rng.randint(98, 138)
            vitals.append({"parent_id": pid, "kind": "sugar", "value": sugar, "value2": None, "unit": "mg/dL", "context": "fasting", "source": "call", "flagged": d == 14, "measured_at": iso(when)})
        else:
            base = 148 if d <= 7 else 128
            sys, dia = base + rng.randint(-5, 7), (92 if d <= 7 else 80) + rng.randint(-4, 5)
            vitals.append({"parent_id": pid, "kind": "bp", "value": sys, "value2": dia, "unit": "mmHg", "context": "", "source": "call", "flagged": False, "measured_at": iso(when)})
    if vitals:
        db.table("vitals").insert(vitals).execute()
    totals["vitals"] += len(vitals)

    # ---- memories + follow-ups + a Memory Lane story
    facts = {
        "aai": ["Goes to the Dagdusheth Ganpati temple on Tuesdays", "Aarav's cricket match is on Sunday", "Plants marigolds and tulsi on the balcony", "Shobha kaku is her closest friend"],
        "appa": ["Walks at Marina on weekday mornings", "Reads The Hindu every morning", "Karthik is preparing for his board exams", "Loves M.S. Subbulakshmi's recordings"],
        "dadi": ["Does pooja every morning at six", "Anaya calls on Sundays", "Likes ginger tea"],
    }[key]
    db.table("memories").insert([{"parent_id": pid, "fact": f, "fact_key": uid("fact", key, f)[:20], "pinned": i == 0, "last_confirmed_at": iso(at(i, 9))} for i, f in enumerate(facts)]).execute()
    follow = {"aai": ["Ask about the knee, and whether the new balcony plants have flowered"], "appa": ["Ask gently how he is feeling and whether he slept"], "dadi": ["Ask about Anaya's visit"]}[key]
    db.table("follow_ups").insert([{"parent_id": pid, "text": f} for f in follow]).execute()
    stories = {
        "aai": ("The Ganpati mandal where Aai met Baba", "आम्ही पहिल्यांदा गणपतीच्या मंडळात भेटलो. तेव्हा मी सतरा वर्षांची होते आणि ते आरतीला ढोल वाजवत होते. त्यांनी मला प्रसाद दिला आणि मी लाजून पळून गेले."),
        "appa": ("My first job at the Madras Port Trust", "நான் முதல் வேலைக்கு போன நாளை மறக்கவே முடியாது. சைக்கிளில் போய் துறைமுகம் சென்றேன். முதல் சம்பளம் எழுபத்தைந்து ரூபாய், அதில் அம்மாவுக்கு புடவை வாங்கினேன்."),
    }
    if key in stories:
        title, text = stories[key]
        recent_call = uid("call", key, "3")
        db.table("memory_lane").insert({"parent_id": pid, "call_id": recent_call, "title": title, "transcript": text, "share_consent": key == "aai", "created_at": iso(at(3, 9, 20))}).execute()


def s_model() -> str:
    return get_settings().groq_model_conversation or "qwen/qwen3.8-27b"


def _seed_family_level(db, ids: dict[str, str], rng: random.Random, now: datetime) -> None:
    aai, appa, dadi = ids["aai"], ids["appa"], ids["dadi"]

    # ---- contacts (the escalation ladder)
    db.table("contacts").insert([
        {"family_id": FAMILY_ID, "parent_id": aai, "name": "Aditya", "relation": "Son", "phone_e164": "+919000000011", "kind": "family", "priority": 1},
        {"family_id": FAMILY_ID, "parent_id": aai, "name": "Shobha kaku", "relation": "Neighbour, two doors down", "phone_e164": "+919000000012", "kind": "neighbour", "priority": 2},
        {"family_id": FAMILY_ID, "parent_id": aai, "name": "Dr. Deshmukh", "relation": "Family doctor", "phone_e164": "+919000000014", "kind": "doctor", "priority": 3},
        {"family_id": FAMILY_ID, "parent_id": appa, "name": "Venkat", "relation": "Son", "phone_e164": "+919000000016", "kind": "family", "priority": 1},
        {"family_id": FAMILY_ID, "parent_id": appa, "name": "Mr. Raghavan", "relation": "Neighbour, upstairs", "phone_e164": "+919000000013", "kind": "neighbour", "priority": 2},
        {"family_id": FAMILY_ID, "parent_id": dadi, "name": "Sunita", "relation": "Daughter", "phone_e164": "+919000000015", "kind": "family", "priority": 1},
    ]).execute()

    # ---- flags
    def flag(pk: str, cat: str, sev: str, quote: str, status: str, d: float, hour: int, source: str = "model") -> str:
        fid = uid("flag", pk, cat, str(d))
        db.table("flags").insert({
            "id": fid, "parent_id": ids[pk], "category": cat, "severity": sev, "evidence_quote": quote, "source": source, "status": status,
            "created_at": iso(at(d, hour, 12)), **({"acknowledged_by": DEMO_USER, "acknowledged_at": iso(at(d, hour + 1))} if status != "open" else {}),
        }).execute()
        return fid

    flag("aai", "recurring_complaint", "medium", "थोडं गुडघं दुखतंय", "open", 0, 9, "pattern")
    flag("aai", "scam", "high", "कोणीतरी माझा OTP मागितला", "acknowledged", 12, 9, "keyword")
    flag("aai", "vitals_bp", "medium", "168/104 mmHg", "resolved", 8, 9, "vitals")
    flag("appa", "distress", "medium", "இன்று எதுவும் செய்யப் பிடிக்கவில்லை", "open", 1, 9, "model")
    fall = flag("appa", "fall", "emergency", "நான் குளியலறையில் விழுந்துவிட்டேன்", "resolved", 20, 9, "keyword")

    # ---- a past escalation that worked (shows the ladder in history)
    esc = uid("escalation", "appa-fall")
    start = at(20, 9, 14)
    db.table("escalations").insert({
        "id": esc, "parent_id": appa, "trigger": "emergency", "flag_id": fall, "status": "resolved", "started_at": iso(start), "resolved_at": iso(start + timedelta(minutes=7)),
        "resolved_by": "contact:Venkat", "summary": "Appa said: \"நான் குளியலறையில் விழுந்துவிட்டேன்\" (fall).",
    }).execute()
    db.table("escalation_events").insert([
        {"escalation_id": esc, "step": 0, "channel": "family_push", "label": "Everyone in the family", "status": "sent", "detail": "Push and in-app alert sent to all family members", "at": iso(start)},
        {"escalation_id": esc, "step": 1, "channel": "call", "label": "Venkat (Son)", "status": "sent", "detail": "Alert call placed; waiting for them to press 1", "at": iso(start + timedelta(minutes=5))},
        {"escalation_id": esc, "step": 1, "channel": "sms", "label": "Venkat (Son)", "status": "sent", "detail": "SMS sent", "at": iso(start + timedelta(minutes=5))},
        {"escalation_id": esc, "step": 99, "channel": "family_push", "label": "contact:Venkat", "status": "acknowledged", "detail": "Venkat pressed 1: he was already driving over", "at": iso(start + timedelta(minutes=7))},
    ]).execute()

    # ---- notifications for the owner
    notes = [
        ("flag", "Aai: recurring complaint", "Knee pain has come up 3 times this week. It may be worth a call or a doctor visit.", 0, 9, False),
        ("dose", "Aai took BP tablet", "Confirmed on Sneha's reminder call.", 1, 8, True),
        ("summary", "Appa's call today", "Appa sounded low and tired today and had not eaten yet. Feeling tired came up again; Sneha will ask tomorrow.", 1, 9, False),
        ("reminder", "Metformin is running low", "Aai's supply is about five days from running out.", 2, 8, False),
        ("vital", "Aai: blood pressure 168/104 mmHg is above the usual range", "Sneha only noted the number and did not give advice. You may want to call.", 8, 9, True),
        ("summary", "Dadi ji's call today", "Dadi ji sounded cheerful and took her thyroid tablet. She went to the temple.", 1, 11, True),
    ]
    db.table("notifications").insert([
        {"user_id": DEMO_USER, "family_id": FAMILY_ID, "kind": k, "title": t, "body": b, "data": {}, "created_at": iso(at(d, h)), "read_at": iso(at(d, h + 1)) if read else None}
        for k, t, b, d, h, read in notes
    ]).execute()

    # ---- family messages: delivered, answered, queued
    db.table("family_messages").insert([
        {"family_id": FAMILY_ID, "parent_id": ids["aai"], "from_user_id": DEMO_USER, "from_name": "Rohan", "kind": "note", "body": "Aarav scored 92 in his maths test! He wants to tell you himself on Sunday.",
         "status": "queued", "created_at": iso(at(0, 7, 55))},
        {"family_id": FAMILY_ID, "parent_id": ids["aai"], "from_user_id": DEMO_USER, "from_name": "Rohan", "kind": "question", "body": "Aai, shall I bring puran poli from Pune's usual shop when I visit on Sunday? Aarav is asking.",
         "status": "queued", "created_at": iso(at(0, 7, 58))},
        {"family_id": FAMILY_ID, "parent_id": ids["aai"], "from_user_id": DEMO_USER, "from_name": "Rohan", "kind": "note", "body": "Dr. Deshmukh confirmed your check-up. I will drive you there.",
         "status": "delivered", "delivered_at": iso(at(2, 9, 6)), "created_at": iso(at(3, 20))},
        {"family_id": FAMILY_ID, "parent_id": ids["aai"], "from_user_id": DEMO_USER2, "from_name": "Aditya", "kind": "question", "body": "Did the plumber come to fix the kitchen tap?",
         "status": "answered", "delivered_at": iso(at(1, 9, 7)), "reply_text": "Yes, he came yesterday afternoon and fixed it.", "replied_at": iso(at(1, 9, 8)), "created_at": iso(at(2, 21))},
        {"family_id": FAMILY_ID, "parent_id": ids["appa"], "from_user_id": DEMO_USER, "from_name": "Rohan", "kind": "note", "body": "I am coming to Chennai on Friday, Appa. I will bring filter coffee from Kumbakonam.",
         "status": "queued", "created_at": iso(at(0, 7, 40))},
    ]).execute()

    # ---- appointments
    tomorrow = (datetime.now(IST) + timedelta(days=1)).replace(hour=10, minute=30, second=0, microsecond=0)
    db.table("appointments").insert([
        {"parent_id": aai, "title": "Heart check-up", "doctor": "Dr. Deshmukh", "location": "Jehangir Hospital, Pune", "at": iso(tomorrow.astimezone(UTC)), "notes": "Carry the last ECG report", "created_by": DEMO_USER},
        {"parent_id": appa, "title": "Eye test", "doctor": "Dr. Lakshmi", "location": "Sankara Nethralaya", "at": iso(at(-5, 11).astimezone(UTC)), "notes": "", "created_by": DEMO_USER},
        {"parent_id": aai, "title": "Annual blood tests", "doctor": "", "location": "Lal Path Labs", "at": iso(at(-12, 8).astimezone(UTC)), "notes": "", "created_by": DEMO_USER2},
    ]).execute()


def _bp_photo() -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (900, 600), (206, 214, 200))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((70, 50, 830, 550), 50, fill=(28, 36, 30))
    try:
        big, small = ImageFont.truetype("arialbd.ttf", 150), ImageFont.truetype("arial.ttf", 44)
    except OSError:
        big = small = ImageFont.load_default()
    d.text((140, 90), "128", font=big, fill=(150, 255, 160))
    d.text((140, 250), "82", font=big, fill=(150, 255, 160))
    d.text((520, 110), "SYS", font=small, fill=(150, 255, 160))
    d.text((520, 270), "DIA", font=small, fill=(150, 255, 160))
    d.text((140, 450), "PULSE 72", font=small, fill=(150, 255, 160))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def _seed_proofs(db, ids: dict[str, str]) -> None:
    """One sample photo (a BP monitor) so the gallery has something real; it is generated, not a real person's reading."""
    aai = ids["aai"]
    path = f"{FAMILY_ID}/{aai}/{uid('proof', 'bp')}.jpg"
    try:
        db.storage.from_("proofs").upload(path, _bp_photo(), {"content-type": "image/jpeg", "upsert": "true"})
    except Exception:  # noqa: BLE001 - the gallery still works without an image
        path = None
    db.table("proofs").insert({
        "id": uid("proof", "bp"), "parent_id": aai, "kind": "bp", "storage_path": path, "extracted": {"kind": "bp", "legible": True, "systolic": 128, "diastolic": 82, "pulse": 72, "note": "A blood pressure monitor showing 128/82, pulse 72."},
        "summary": "Blood pressure 128/82 mmHg", "uploaded_by": "parent_link", "created_at": iso(at(4, 8, 40)),
    }).execute()


def _seed_insights(db, ids: dict[str, str], s: Settings) -> None:
    """Run the real insight code over the seeded history (and the weekly digest prose if a Groq key is set)."""
    from datetime import date

    from .insights import compute_for_parent
    from .store import SupabaseStore

    store = SupabaseStore(s)
    for pid in ids.values():
        try:
            asyncio.run(compute_for_parent(s, store, pid, date.today()))
        except Exception as e:  # noqa: BLE001 - the demo still works without trend cards
            print(f"insights skipped for {pid}: {e}")
    # The seeded transcripts are assembled from a few stock phrases, so phrases repeat across calls. That is an artefact of made-up
    # data, not a real pattern: drop the repetition insight here (it is covered by real calls in production).
    db.table("insights").delete().eq("kind", "repetition").in_("parent_id", list(ids.values())).execute()


if __name__ == "__main__":
    print(seed())
