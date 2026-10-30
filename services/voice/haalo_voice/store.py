"""Persistence. SupabaseStore in real runs; NullStore when SUPABASE_URL is unset (dev with no DB)."""

from __future__ import annotations

import hashlib
import statistics
from datetime import UTC, datetime
from typing import Any, Protocol

import httpx
from loguru import logger

from .care_store import CareStoreMixin, NullCare
from .config import Settings
from .session import CallSession, Medicine, ParentProfile

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _norm_key(fact: str) -> str:
    return hashlib.sha1(" ".join(fact.lower().split()).encode()).hexdigest()[:20]


def _lang_name(code: str) -> str:
    from .languages import load_registry

    lang = load_registry().get(code)
    return lang.name if lang else "English"


def latency_stats(vals: list[float]) -> tuple[int | None, int | None]:
    if not vals:
        return None, None
    s = sorted(vals)
    p95 = s[min(len(s) - 1, int(round(0.95 * (len(s) - 1))))]
    return int(statistics.median(s)), int(p95)


class Store(Protocol):
    async def load_parent(self, parent_id: str) -> ParentProfile | None: ...
    async def find_parent_by_phone(self, e164: str) -> ParentProfile | None: ...
    async def create_call(self, session: CallSession, *, status: str, scheduled_for: str | None = None) -> str: ...
    async def update_call(self, call_id: str, **fields: Any) -> None: ...
    async def finish_call(self, session: CallSession, status: str) -> None: ...
    async def add_flag(self, session: CallSession, flag: dict) -> None: ...
    async def set_consent(self, session: CallSession, granted: bool) -> None: ...
    async def apply_preference(self, session: CallSession, pref: dict) -> None: ...
    async def notify_family(self, parent_id: str, kind: str, title: str, body: str, data: dict, *, pref: str) -> None: ...
    async def save_summary(self, session: CallSession, summary: dict, model: str) -> None: ...
    async def recent_flag_counts(self, parent_id: str, days: int = 7) -> dict[str, int]: ...
    async def enqueue_due_calls(self) -> int: ...
    async def claim_due_calls(self, limit: int = 5) -> list[dict]: ...
    async def consecutive_missed_days(self, parent_id: str) -> int: ...
    async def get_call(self, call_id: str) -> dict | None: ...
    async def save_recording(self, session: CallSession, wav: bytes) -> None: ...
    async def run_daily_jobs(self) -> None: ...


class NullStore(NullCare):
    """Dev without a database: logs only."""

    async def load_parent(self, parent_id: str) -> ParentProfile | None:
        return None

    async def find_parent_by_phone(self, e164: str) -> ParentProfile | None:
        return None

    async def create_call(self, session: CallSession, *, status: str, scheduled_for: str | None = None) -> str:
        return session.call_id

    async def update_call(self, call_id: str, **fields: Any) -> None:
        logger.debug(f"[null-store] update_call {call_id} {fields}")

    async def finish_call(self, session: CallSession, status: str) -> None:
        p50, p95 = latency_stats(session.latencies_ms)
        logger.info(f"[null-store] call {session.call_id} {status} turns={len(session.turns)} p50={p50} p95={p95}")

    async def add_flag(self, session: CallSession, flag: dict) -> None:
        logger.warning(f"[null-store] FLAG {flag}")

    async def set_consent(self, session: CallSession, granted: bool) -> None:
        logger.info(f"[null-store] consent={granted}")

    async def apply_preference(self, session: CallSession, pref: dict) -> None:
        logger.info(f"[null-store] preference {pref}")

    async def notify_family(self, parent_id: str, kind: str, title: str, body: str, data: dict, *, pref: str) -> None:
        logger.info(f"[null-store] NOTIFY {kind}: {title} | {body}")

    async def save_summary(self, session: CallSession, summary: dict, model: str) -> None:
        logger.info(f"[null-store] summary {summary}")

    async def recent_flag_counts(self, parent_id: str, days: int = 7) -> dict[str, int]:
        return {}

    async def enqueue_due_calls(self) -> int:
        return 0

    async def claim_due_calls(self, limit: int = 5) -> list[dict]:
        return []

    async def consecutive_missed_days(self, parent_id: str) -> int:
        return 0

    async def get_call(self, call_id: str) -> dict | None:
        return None

    async def save_recording(self, session: CallSession, wav: bytes) -> None:
        logger.info(f"[null-store] recording {len(wav)} bytes (not stored)")

    async def run_daily_jobs(self) -> None:
        return None


class SupabaseStore(CareStoreMixin):
    def __init__(self, s: Settings):
        from supabase import create_client

        self._s = s
        self._db = create_client(s.supabase_url, s.supabase_service_role_key)  # sync client; wrapped in threads
        self._http = httpx.AsyncClient(timeout=10)

    # ---- helpers
    async def _run(self, fn):
        import asyncio

        return await asyncio.to_thread(fn)

    async def _profile_from_row(self, row: dict) -> ParentProfile:
        db, pid = self._db, row["id"]

        def load():
            ctx = db.table("parent_context").select("*").eq("parent_id", pid).maybe_single().execute()
            meds = db.table("medicines").select("*").eq("parent_id", pid).eq("active", True).execute()
            mem = (
                db.table("memories").select("fact,pinned").eq("parent_id", pid)
                .order("pinned", desc=True).order("last_confirmed_at", desc=True).limit(20).execute()
            )
            calls = (
                db.table("calls").select("started_at,call_summaries(summary_for_family)")
                .eq("parent_id", pid).eq("status", "completed").order("started_at", desc=True).limit(3).execute()
            )
            fups = db.table("follow_ups").select("text").eq("parent_id", pid).eq("done", False).limit(8).execute()
            sched = db.table("call_schedules").select("window_start").eq("parent_id", pid).maybe_single().execute()
            owner = (
                db.table("family_members").select("user_id").eq("family_id", row["family_id"]).eq("role", "owner").limit(1).execute()
            )
            child = row.get("child_name") or ""
            fam_lang = "en"
            if owner.data:
                prof = db.table("profiles").select("full_name,app_language").eq("id", owner.data[0]["user_id"]).maybe_single().execute()
                pdata = (prof.data or {}) if prof else {}
                child = child or pdata.get("full_name", "")
                fam_lang = pdata.get("app_language", "en")
            return ctx, meds, mem, calls, fups, sched, child, fam_lang, self._care_profile_extras(row)

        ctx, meds, mem, calls, fups, sched, child, fam_lang, extras = await self._run(load)
        c = (ctx.data if ctx else None) or {}
        summaries = []
        for r in calls.data or []:
            cs = r.get("call_summaries")
            txt = (cs[0] if isinstance(cs, list) and cs else cs or {}).get("summary_for_family") if cs else None
            if txt:
                summaries.append(txt)
        window = (sched.data if sched else None) or {}
        return ParentProfile(
            parent_id=pid,
            name=row["name"],
            language=row["language"],
            honorific=row.get("honorific") or "",
            child_name=child or "your family",
            phone_e164=row["phone_e164"],
            dialect=row.get("dialect", ""),
            voice_gender=row.get("voice_gender", "female"),
            pace=float(row.get("pace", 0.9)),
            silence_ms=int(row.get("silence_ms", 1000)),
            consent_status=row.get("consent_status", "pending"),
            family_id=row.get("family_id", ""),
            recording_consent=bool(row.get("recording_consent", False)),
            interests=c.get("interests", []),
            family_names=c.get("family_names", {}),
            doctor_names=c.get("doctor_names", []),
            vocab=c.get("vocab", []),
            medicines=[Medicine(m["name"], m.get("dose_text", ""), m.get("times", [])) for m in (meds.data or [])],
            pinned_facts=[m["fact"] for m in (mem.data or []) if m["pinned"]],
            memories=[m["fact"] for m in (mem.data or []) if not m["pinned"]],
            recent_summaries=summaries,
            follow_ups=[f["text"] for f in (fups.data or [])],
            next_call_time=str(window.get("window_start", "09:00"))[:5].lstrip("0") or "9:00",
            timezone=row.get("call_timezone", "Asia/Kolkata"),
            family_language=_lang_name(fam_lang),
            sandbox=bool(row.get("is_demo")),
            tradition=row.get("tradition") or "",
            birthday=row.get("birthday"),
            vital_ranges=row.get("vital_ranges") or {},
            **extras,
        )

    # ---- Store API
    async def load_parent(self, parent_id: str) -> ParentProfile | None:
        r = await self._run(lambda: self._db.table("parents").select("*").eq("id", parent_id).maybe_single().execute())
        return await self._profile_from_row(r.data) if r and r.data else None

    async def find_parent_by_phone(self, e164: str) -> ParentProfile | None:
        r = await self._run(lambda: self._db.table("parents").select("*").eq("phone_e164", e164).limit(1).execute())
        return await self._profile_from_row(r.data[0]) if r.data else None

    async def create_call(self, session: CallSession, *, status: str, scheduled_for: str | None = None) -> str:
        row = {
            "id": session.call_id,
            "parent_id": None if session.profile.is_demo else session.profile.parent_id,
            "direction": session.direction,
            "status": status,
            "scheduled_for": scheduled_for or datetime.now(UTC).isoformat(),
            "provider": session.provider,
            "provider_call_id": session.provider_call_id,
            "language": session.profile.language,
            "demo": session.profile.is_demo,
            "is_consent_call": session.profile.consent_status == "pending" and session.purpose == "checkin",
            "purpose": session.purpose,
        }
        await self._run(lambda: self._db.table("calls").upsert(row).execute())
        return session.call_id

    async def update_call(self, call_id: str, **fields: Any) -> None:
        await self._run(lambda: self._db.table("calls").update(fields).eq("id", call_id).execute())

    async def finish_call(self, session: CallSession, status: str) -> None:
        p50, p95 = latency_stats(session.response_latencies_ms or session.latencies_ms)
        dur = int(datetime.now(UTC).timestamp() - session.started_at)
        fields = {
            "status": status,
            "ended_at": datetime.now(UTC).isoformat(),
            "duration_s": dur,
            "latency_p50_ms": p50,
            "latency_p95_ms": p95,
            "stt_provider": session.stt_provider,
            "tts_provider": session.tts_provider,
            "llm_model": session.llm_model,
            "end_reason": session.end_reason,
            "cost_breakdown": cost_breakdown(self._s, session, dur),
        }
        turns = [
            {
                "call_id": session.call_id,
                "speaker": t["speaker"],
                "text": t["text"],
                "started_ms": int((t["t"] - session.started_at) * 1000),
                "latency_ms": t.get("latency_ms"),
            }
            for t in session.turns
            if t.get("text")
        ]

        def write():
            self._db.table("calls").update(fields).eq("id", session.call_id).execute()
            if turns:
                self._db.table("call_turns").insert(turns).execute()

        await self._run(write)

    async def add_flag(self, session: CallSession, flag: dict) -> None:
        if session.profile.is_demo:
            return
        row = {"call_id": session.call_id, "parent_id": session.profile.parent_id, **{k: flag[k] for k in ("category", "severity", "evidence_quote", "source")}}
        await self._run(lambda: self._db.table("flags").insert(row).execute())

    async def set_consent(self, session: CallSession, granted: bool) -> None:
        if session.profile.is_demo:
            return
        status = "granted" if granted else "declined"
        fields = {"consent_status": status, "consent_at": datetime.now(UTC).isoformat(), "consent_call_id": session.call_id}
        await self._run(lambda: self._db.table("parents").update(fields).eq("id", session.profile.parent_id).execute())

    async def apply_preference(self, session: CallSession, pref: dict) -> None:
        if session.profile.is_demo:
            return
        from datetime import timedelta

        kind, value = pref.get("kind"), str(pref.get("value", ""))
        pid = session.profile.parent_id
        upd: dict[str, Any] = {}
        if kind == "skip_tomorrow":
            upd["skip_next_date"] = (datetime.now(UTC) + timedelta(days=1)).date().isoformat()
        elif kind == "pause_until" and value:
            upd["paused_until"] = f"{value}T00:00:00+05:30"
        elif kind == "call_later":
            mins = int(value) if value.isdigit() else 60
            when = (datetime.now(UTC) + timedelta(minutes=mins)).isoformat()
            row = {"parent_id": pid, "direction": "outbound", "status": "queued", "scheduled_for": when}
            await self._run(lambda: self._db.table("calls").insert(row).execute())
            return
        if upd:
            await self._run(lambda: self._db.table("call_schedules").update(upd).eq("parent_id", pid).execute())

    async def notify_family(self, parent_id: str, kind: str, title: str, body: str, data: dict, *, pref: str) -> None:
        def load():
            p = self._db.table("parents").select("family_id").eq("id", parent_id).maybe_single().execute()
            fid = p.data["family_id"]
            members = self._db.table("family_members").select("user_id,alert_prefs").eq("family_id", fid).execute()
            return fid, members.data or []

        fid, members = await self._run(load)
        targets = [m["user_id"] for m in members if (m.get("alert_prefs") or {}).get(pref, True)]
        if not targets:
            return
        rows = [{"user_id": u, "family_id": fid, "kind": kind, "title": title, "body": body, "data": data} for u in targets]
        tokens = await self._run(lambda: self._db.table("push_tokens").select("expo_token").in_("user_id", targets).execute())
        await self._run(lambda: self._db.table("notifications").insert(rows).execute())
        msgs = [
            {"to": t["expo_token"], "title": title, "body": body, "data": data, "sound": "default",
             "priority": "high" if kind == "flag" else "default", "channelId": "alerts" if kind == "flag" else "default"}
            for t in (tokens.data or [])
        ]
        if msgs:
            try:
                r = await self._http.post(EXPO_PUSH_URL, json=msgs)
                r.raise_for_status()
            except Exception as e:  # push is best-effort; the in-app notification row already exists
                logger.warning(f"expo push failed: {e}")

    async def save_summary(self, session: CallSession, summary: dict, model: str) -> None:
        if session.profile.is_demo:
            return
        pid, cid = session.profile.parent_id, session.call_id
        mems = [{"parent_id": pid, "fact": f, "fact_key": _norm_key(f), "source_call_id": cid, "last_confirmed_at": datetime.now(UTC).isoformat()} for f in summary.get("new_facts", []) if f]
        fups = [{"parent_id": pid, "text": f, "source_call_id": cid} for f in summary.get("follow_ups", []) if f]
        story = summary.get("story") or {}
        lane = (
            {"parent_id": pid, "call_id": cid, "title": story["title"], "transcript": story.get("transcript", ""), "share_consent": False}
            if story.get("title")
            else None
        )

        def write():
            self._db.table("call_summaries").upsert(
                {"call_id": cid, "data": summary, "summary_for_family": summary.get("summary_for_family", ""), "mood": summary.get("mood"), "model": model}
            ).execute()
            if mems:
                self._db.table("memories").upsert(mems, on_conflict="parent_id,fact_key").execute()
            if fups:
                self._db.table("follow_ups").insert(fups).execute()
            if lane:  # a story worth keeping; sharing needs the parent's consent, so it starts unshared
                self._db.table("memory_lane").insert(lane).execute()

        await self._run(write)

    async def recent_flag_counts(self, parent_id: str, days: int = 7) -> dict[str, int]:
        from datetime import timedelta

        since = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        r = await self._run(lambda: self._db.table("calls").select("call_summaries(data)").eq("parent_id", parent_id).gte("started_at", since).execute())
        counts: dict[str, int] = {}
        for row in r.data or []:
            cs = row.get("call_summaries")
            data = (cs[0] if isinstance(cs, list) and cs else cs or {}).get("data", {}) if cs else {}
            for c in data.get("complaints", []):
                k = c.lower().strip()
                counts[k] = counts.get(k, 0) + 1
        return counts

    async def enqueue_due_calls(self) -> int:
        r = await self._run(lambda: self._db.rpc("enqueue_due_calls").execute())
        return int(r.data or 0)

    async def claim_due_calls(self, limit: int = 5) -> list[dict]:
        r = await self._run(lambda: self._db.rpc("claim_due_calls", {"p_limit": limit}).execute())
        return r.data or []

    async def save_recording(self, session: CallSession, wav: bytes) -> None:
        """Opt-in only (caller checks parent.recording_consent). Stored privately under <family_id>/<call_id>.wav."""
        path = f"{session.profile.family_id}/{session.call_id}.wav"

        def up():
            self._db.storage.from_("recordings").upload(path, wav, {"content-type": "audio/wav", "upsert": "true"})
            self._db.table("calls").update({"recording_path": path}).eq("id", session.call_id).execute()

        await self._run(up)

    async def run_daily_jobs(self) -> None:
        """Once a day: purge expired recordings, then write the admin digest for yesterday."""
        from datetime import timedelta

        def retention():
            rows = self._db.rpc("expired_recordings").execute().data or []
            if rows:
                self._db.storage.from_("recordings").remove([r["recording_path"] for r in rows])
                for r in rows:
                    self._db.table("calls").update({"recording_path": None}).eq("id", r["call_id"]).execute()
            return len(rows)

        purged = await self._run(retention)
        day = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()

        def digest():
            lo, hi = f"{day}T00:00:00Z", f"{day}T23:59:59Z"
            calls = self._db.table("calls").select("status,duration_s,latency_p95_ms,cost_breakdown").gte("created_at", lo).lt("created_at", hi).execute().data or []
            flags = self._db.table("flags").select("severity").gte("created_at", lo).lt("created_at", hi).execute().data or []
            done = [c for c in calls if c["status"] == "completed"]
            attempted = [c for c in calls if c["status"] != "queued"]
            p95s = sorted(c["latency_p95_ms"] for c in calls if c.get("latency_p95_ms"))
            cost = sum((c.get("cost_breakdown") or {}).get("total", 0) for c in calls)
            data = {
                "calls_completed": len(done),
                "answer_rate": round(len(done) / len(attempted), 3) if attempted else None,
                "avg_duration_s": round(sum(c["duration_s"] or 0 for c in done) / len(done)) if done else None,
                "p95_latency_ms": p95s[int(0.95 * (len(p95s) - 1))] if p95s else None,
                "flags": len(flags),
                "emergency_flags": len([f for f in flags if f["severity"] == "emergency"]),
                "cost_per_completed": round(cost / len(done), 4) if done else None,
                "recordings_purged": purged,
            }
            self._db.table("daily_digests").upsert({"day": day, "data": data}).execute()
            return data

        data = await self._run(digest)
        logger.info(f"daily digest {day}: {data}")

    async def get_call(self, call_id: str) -> dict | None:
        r = await self._run(lambda: self._db.table("calls").select("*").eq("id", call_id).maybe_single().execute())
        return r.data if r else None

    async def consecutive_missed_days(self, parent_id: str) -> int:
        r = await self._run(
            lambda: self._db.table("calls").select("status,created_at").eq("parent_id", parent_id)
            .eq("direction", "outbound").eq("purpose", "checkin").order("created_at", desc=True).limit(10).execute()
        )
        days: dict[str, bool] = {}
        for row in r.data or []:
            d = row["created_at"][:10]
            days[d] = days.get(d, False) or row["status"] == "completed"
        n = 0
        for d in sorted(days, reverse=True):
            if days[d]:
                break
            n += 1
        return n


def cost_breakdown(s: Settings, session: CallSession, duration_s: int) -> dict:
    """Rates come from config (never hard-coded). Currency is whatever the rates are expressed in."""
    tel = round(duration_s / 60 * s.rate_telephony_per_min, 4) if session.provider != "webrtc" else 0.0
    stt = round(duration_s * 0.5 * s.rate_stt_per_second, 4)  # ~half the call is parent speech
    llm = round(session.llm_tokens / 1000 * s.rate_llm_per_1k_tokens, 4)
    tts = round(session.tts_chars / 1000 * s.rate_tts_per_1k_chars, 4)
    return {
        "telephony_minutes": round(duration_s / 60, 2), "stt_seconds": int(duration_s * 0.5),
        "llm_tokens": session.llm_tokens, "tts_chars": session.tts_chars,
        "telephony_cost": tel, "stt_cost": stt, "llm_cost": llm, "tts_cost": tts,
        "total": round(tel + stt + llm + tts, 4),
    }


def build_store(s: Settings) -> Store:
    if s.supabase_url and s.supabase_service_role_key:
        return SupabaseStore(s)
    logger.warning("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: using NullStore (nothing is persisted)")
    return NullStore()
