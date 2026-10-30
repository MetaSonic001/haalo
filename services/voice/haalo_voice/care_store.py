"""Persistence for the care features (doses, vitals, contacts and escalation, family messages, appointments, proofs, insights).
A mixin over SupabaseStore: it only needs `self._db` (sync supabase client) and `self._run` (thread wrapper)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from loguru import logger

from .doses import days_of_stock, dose_datetimes, local_label, match_medicine
from .festivals import occasions_on
from .session import ApptLine, DoseLine, MessageLine


def _now() -> datetime:
    return datetime.now(UTC)


def _local_day(tz: str, now: datetime | None = None) -> date:
    return (now or _now()).astimezone(ZoneInfo(tz)).date()


def _when_text(at: datetime, tz: str, now: datetime) -> str:
    local, today = at.astimezone(ZoneInfo(tz)), _local_day(tz, now)
    clock = local.strftime("%I:%M %p").lstrip("0").lower()
    delta = (local.date() - today).days
    day = "today" if delta == 0 else "tomorrow" if delta == 1 else local.strftime("on %A %d %B")
    return f"{day} at {clock}"


class CareStoreMixin:
    _db: Any

    async def _run(self, fn): ...  # provided by SupabaseStore

    # ------------------------------------------------------------ profile extras (runs inside the profile loader thread)
    def _care_profile_extras(self, row: dict) -> dict:
        db, pid, tz = self._db, row["id"], row.get("call_timezone", "Asia/Kolkata")
        now = _now()
        today = _local_day(tz, now)
        lo = datetime.combine(today, datetime.min.time(), tzinfo=ZoneInfo(tz)).astimezone(UTC)
        hi = lo + timedelta(days=1)
        ev = (
            db.table("dose_events").select("id,due_at,status,medicines(name,dose_text)")
            .eq("parent_id", pid).gte("due_at", lo.isoformat()).lt("due_at", hi.isoformat()).order("due_at").execute().data or []
        )
        doses = [
            DoseLine(e["id"], (e.get("medicines") or {}).get("name", ""), (e.get("medicines") or {}).get("dose_text", ""),
                     local_label(datetime.fromisoformat(e["due_at"]), tz), e["status"])
            for e in ev
        ]
        ap = (
            db.table("appointments").select("id,title,doctor,at").eq("parent_id", pid).eq("status", "scheduled")
            .gte("at", now.isoformat()).lt("at", (now + timedelta(hours=60)).isoformat()).order("at").execute().data or []
        )
        appts = [ApptLine(a["id"], a["title"], a.get("doctor", ""), _when_text(datetime.fromisoformat(a["at"]), tz, now)) for a in ap]
        msgs = (
            db.table("family_messages").select("id,from_name,kind,body").eq("parent_id", pid).eq("status", "queued")
            .order("created_at").limit(5).execute().data or []
        )
        vit = db.table("vitals").select("kind").eq("parent_id", pid).gte("measured_at", (now - timedelta(days=21)).isoformat()).execute().data or []
        meds = db.table("medicines").select("name,times,stock_count,pills_per_dose").eq("parent_id", pid).eq("active", True).execute().data or []
        refills = [
            m["name"] for m in meds
            if m.get("stock_count") is not None
            and (d := days_of_stock(m["stock_count"], m.get("pills_per_dose") or 1, max(1, len(m.get("times") or [])))) is not None
            and d <= 5
        ]
        return {
            "doses_today": doses,
            "appointments": appts,
            "messages": [MessageLine(m["id"], m.get("from_name", ""), m["kind"], m["body"]) for m in msgs],
            "vital_kinds": sorted({v["kind"] for v in vit}),
            "refills": refills,
            "occasions": occasions_on(
                today, language=row["language"], tradition=row.get("tradition") or "", birthday=row.get("birthday"),
                parent_name=row.get("honorific") or row["name"],
            ),
        }

    async def parent_brief(self, parent_id: str) -> dict | None:
        """The few parent columns the family calendar needs, in one query (the full profile loader makes ten)."""
        r = await self._run(
            lambda: self._db.table("parents").select("name,honorific,language,tradition,birthday").eq("id", parent_id).maybe_single().execute()
        )
        return r.data if r else None

    # ------------------------------------------------------------ doses
    async def ensure_dose_events(self, now: datetime | None = None) -> int:
        """Create today's dose events for every active medicine (idempotent)."""
        now = now or _now()

        def work() -> int:
            meds = (
                self._db.table("medicines").select("id,parent_id,times,parents(call_timezone,consent_status)").eq("active", True).execute().data or []
            )
            rows: list[dict] = []
            for m in meds:
                par = m.get("parents") or {}
                if par.get("consent_status") == "declined":
                    continue
                tz = par.get("call_timezone", "Asia/Kolkata")
                for due in dose_datetimes(m.get("times") or [], _local_day(tz, now), tz):
                    rows.append({"parent_id": m["parent_id"], "medicine_id": m["id"], "due_at": due.isoformat()})
            if rows:
                self._db.table("dose_events").upsert(rows, on_conflict="medicine_id,due_at", ignore_duplicates=True).execute()
            return len(rows)

        return await self._run(work)

    async def dose_timeline(self, parent_id: str, tz: str, day: date | None = None) -> list[dict]:
        day = day or _local_day(tz)
        lo = datetime.combine(day, datetime.min.time(), tzinfo=ZoneInfo(tz)).astimezone(UTC)
        r = await self._run(
            lambda: self._db.table("dose_events").select("*,medicines(name,dose_text,critical)").eq("parent_id", parent_id)
            .gte("due_at", lo.isoformat()).lt("due_at", (lo + timedelta(days=1)).isoformat()).order("due_at").execute()
        )
        return r.data or []

    async def reminder_candidates(self, now: datetime, retry_min: int, missed_after_min: int, max_attempts: int) -> tuple[list[dict], list[dict]]:
        """(to_remind, to_mark_missed) among open dose events of real (non-sandbox) parents that agreed to calls."""

        def work() -> list[dict]:
            return (
                self._db.table("dose_events")
                .select("id,parent_id,due_at,status,reminder_attempts,last_reminder_at,medicines(name,critical),parents(is_demo,consent_status,call_timezone,name,honorific)")
                .in_("status", ["pending", "reminded"]).lte("due_at", now.isoformat()).gte("due_at", (now - timedelta(hours=12)).isoformat())
                .execute().data or []
            )

        rows = [r for r in await self._run(work) if not (r.get("parents") or {}).get("is_demo") and (r.get("parents") or {}).get("consent_status") == "granted"]
        remind, missed = [], []
        for r in rows:
            due = datetime.fromisoformat(r["due_at"])
            if now >= due + timedelta(minutes=missed_after_min):
                missed.append(r)
                continue
            last = datetime.fromisoformat(r["last_reminder_at"]) if r.get("last_reminder_at") else None
            if r["reminder_attempts"] < max_attempts and (last is None or now - last >= timedelta(minutes=retry_min)):
                remind.append(r)
        return remind, missed

    async def checkin_soon(self, parent_id: str, minutes: int) -> bool:
        now = _now()
        r = await self._run(
            lambda: self._db.table("calls").select("id").eq("parent_id", parent_id).eq("purpose", "checkin")
            .in_("status", ["queued", "dialing", "in_progress"]).gte("scheduled_for", (now - timedelta(minutes=5)).isoformat())
            .lte("scheduled_for", (now + timedelta(minutes=minutes)).isoformat()).limit(1).execute()
        )
        return bool(r.data)

    async def create_reminder_call(self, parent_id: str, event_ids: list[str]) -> str:
        now = _now().isoformat()

        def work() -> str:
            call = self._db.table("calls").insert(
                {"parent_id": parent_id, "direction": "outbound", "status": "queued", "scheduled_for": now, "purpose": "reminder"}
            ).execute().data[0]
            cur = self._db.table("dose_events").select("id,reminder_attempts").in_("id", event_ids).execute().data or []
            for e in cur:
                self._db.table("dose_events").update(
                    {"call_id": call["id"], "status": "reminded", "reminder_attempts": e["reminder_attempts"] + 1, "last_reminder_at": now}
                ).eq("id", e["id"]).execute()
            return call["id"]

        return await self._run(work)

    async def dose_events_for_call(self, call_id: str) -> list[str]:
        r = await self._run(lambda: self._db.table("dose_events").select("id").eq("call_id", call_id).execute())
        return [x["id"] for x in r.data or []]

    async def open_doses_for_reminder(self, parent_id: str, tz: str) -> list[str]:
        """Doses that are due now or earlier today and not yet taken: what a reminder call is about."""
        now = _now()
        lo = datetime.combine(_local_day(tz, now), datetime.min.time(), tzinfo=ZoneInfo(tz)).astimezone(UTC)
        r = await self._run(
            lambda: self._db.table("dose_events").select("id").eq("parent_id", parent_id).in_("status", ["pending", "reminded", "missed"])
            .gte("due_at", lo.isoformat()).lte("due_at", now.isoformat()).order("due_at").execute()
        )
        return [x["id"] for x in r.data or []]

    async def make_dose_due(self, parent_id: str) -> dict | None:
        """Demo helper: put one of the parent's medicines 'due right now' (unconfirmed), so a reminder call can be shown."""
        now = _now()

        def work() -> dict | None:
            meds = self._db.table("medicines").select("id,name").eq("parent_id", parent_id).eq("active", True).order("created_at").execute().data or []
            if not meds:
                return None
            # prefer a medicine that has no open dose today, so the demo is repeatable
            m = meds[0]
            due = (now - timedelta(minutes=2)).replace(microsecond=0)
            self._db.table("dose_events").upsert(
                {"parent_id": parent_id, "medicine_id": m["id"], "due_at": due.isoformat(), "status": "pending"}, on_conflict="medicine_id,due_at"
            ).execute()
            return {"medicine": m["name"], "due_at": due.isoformat()}

        return await self._run(work)

    async def mark_missed(self, event_ids: list[str]) -> None:
        await self._run(lambda: self._db.table("dose_events").update({"status": "missed"}).in_("id", event_ids).execute())

    async def confirm_dose(self, parent_id: str, name: str, tz: str, *, via: str, call_id: str | None = None) -> dict | None:
        """Mark the earliest open dose of the medicine matching `name` today as taken. Returns {medicine, refill} or None."""
        now = _now()
        lo = datetime.combine(_local_day(tz, now), datetime.min.time(), tzinfo=ZoneInfo(tz)).astimezone(UTC)

        def work() -> dict | None:
            ev = (
                self._db.table("dose_events").select("id,due_at,medicine_id,medicines(name,stock_count,pills_per_dose,times,refill_notified_at)")
                .eq("parent_id", parent_id).in_("status", ["pending", "reminded", "missed"])
                .gte("due_at", lo.isoformat()).lte("due_at", (now + timedelta(hours=2)).isoformat()).order("due_at").execute().data or []
            )
            names = sorted({(e.get("medicines") or {}).get("name", "") for e in ev})
            hit = match_medicine(name, [n for n in names if n])
            if not hit:
                return None
            e = next(x for x in ev if (x.get("medicines") or {}).get("name") == hit)
            self._db.table("dose_events").update(
                {"status": "taken", "confirmed_via": via, "confirmed_at": now.isoformat(), "call_id": call_id}
            ).eq("id", e["id"]).execute()
            med = e.get("medicines") or {}
            refill = False
            if med.get("stock_count") is not None:
                left = max(0, med["stock_count"] - (med.get("pills_per_dose") or 1))
                self._db.table("medicines").update({"stock_count": left}).eq("id", e["medicine_id"]).execute()
                d = days_of_stock(left, med.get("pills_per_dose") or 1, max(1, len(med.get("times") or [])))
                refill = d is not None and d <= 5 and not med.get("refill_notified_at")
                if refill:
                    self._db.table("medicines").update({"refill_notified_at": now.isoformat()}).eq("id", e["medicine_id"]).execute()
            return {"medicine": hit, "refill": refill, "event_id": e["id"]}

        return await self._run(work)

    async def set_dose_status(self, event_id: str, status: str, via: str | None = None, proof_id: str | None = None) -> None:
        fields: dict[str, Any] = {"status": status}
        if status == "taken":
            fields.update({"confirmed_via": via or "manual", "confirmed_at": _now().isoformat()})
        if proof_id:
            fields["proof_id"] = proof_id
        await self._run(lambda: self._db.table("dose_events").update(fields).eq("id", event_id).execute())

    # ------------------------------------------------------------ family messages
    async def deliver_messages(self, ids: list[str], call_id: str) -> None:
        if ids:
            await self._run(
                lambda: self._db.table("family_messages").update(
                    {"status": "delivered", "delivered_call_id": call_id, "delivered_at": _now().isoformat()}
                ).in_("id", ids).execute()
            )

    async def save_message_replies(self, replies: list[dict]) -> None:
        for r in replies:
            if r.get("id") and r.get("reply"):
                await self._run(
                    lambda r=r: self._db.table("family_messages").update(
                        {"status": "answered", "reply_text": r["reply"], "replied_at": _now().isoformat()}
                    ).eq("id", r["id"]).eq("kind", "question").execute()
                )

    # ------------------------------------------------------------ appointments
    async def appointments_to_remind(self) -> list[dict]:
        now = _now()
        r = await self._run(
            lambda: self._db.table("appointments").select("*,parents(name,honorific,is_demo,call_timezone)").eq("status", "scheduled")
            .eq("family_reminded", False).gte("at", now.isoformat()).lte("at", (now + timedelta(hours=26)).isoformat()).execute()
        )
        return [a for a in r.data or [] if not (a.get("parents") or {}).get("is_demo")]

    async def mark_appointment_reminded(self, appt_id: str) -> None:
        await self._run(lambda: self._db.table("appointments").update({"family_reminded": True}).eq("id", appt_id).execute())

    # ------------------------------------------------------------ vitals
    async def log_vital(self, parent_id: str, kind: str, value: float, value2: float | None, unit: str, *, context: str = "",
                        source: str = "call", call_id: str | None = None, proof_id: str | None = None, flagged: bool = False) -> str:
        row = {"parent_id": parent_id, "kind": kind, "value": value, "value2": value2, "unit": unit, "context": context,
               "source": source, "call_id": call_id, "proof_id": proof_id, "flagged": flagged}
        r = await self._run(lambda: self._db.table("vitals").insert(row).execute())
        return r.data[0]["id"]

    async def parent_ranges(self, parent_id: str) -> dict:
        r = await self._run(lambda: self._db.table("parents").select("vital_ranges").eq("id", parent_id).maybe_single().execute())
        return (r.data or {}).get("vital_ranges") or {} if r else {}

    # ------------------------------------------------------------ contacts + escalation
    async def contacts_for(self, parent_id: str) -> list[dict]:
        def work() -> list[dict]:
            fam = self._db.table("parents").select("family_id").eq("id", parent_id).maybe_single().execute().data
            if not fam:
                return []
            rows = self._db.table("contacts").select("*").eq("family_id", fam["family_id"]).eq("active", True).order("priority").execute().data or []
            return [c for c in rows if c.get("parent_id") in (None, parent_id)]

        return await self._run(work)

    async def create_escalation(self, parent_id: str, trigger: str, summary: str, *, flag_id: str | None = None, call_id: str | None = None) -> str:
        row = {"parent_id": parent_id, "trigger": trigger, "summary": summary, "flag_id": flag_id, "call_id": call_id}
        r = await self._run(lambda: self._db.table("escalations").insert(row).execute())
        return r.data[0]["id"]

    async def add_escalation_event(self, esc_id: str, step: int, channel: str, label: str, status: str, detail: str = "", contact_id: str | None = None) -> None:
        row = {"escalation_id": esc_id, "step": step, "channel": channel, "label": label, "status": status, "detail": detail, "contact_id": contact_id}
        await self._run(lambda: self._db.table("escalation_events").insert(row).execute())

    async def get_escalation(self, esc_id: str) -> dict | None:
        r = await self._run(lambda: self._db.table("escalations").select("*").eq("id", esc_id).maybe_single().execute())
        return r.data if r else None

    async def resolve_escalation(self, esc_id: str, by: str) -> None:
        await self._run(
            lambda: self._db.table("escalations").update({"status": "resolved", "resolved_at": _now().isoformat(), "resolved_by": by}).eq("id", esc_id).eq("status", "open").execute()
        )
        await self.add_escalation_event(esc_id, 99, "family_push", by, "acknowledged", "Someone confirmed they are on it")

    async def open_escalations(self, max_age_h: int = 3) -> list[dict]:
        since = (_now() - timedelta(hours=max_age_h)).isoformat()
        r = await self._run(lambda: self._db.table("escalations").select("*,escalation_events(step,channel)").eq("status", "open").gte("started_at", since).execute())
        return r.data or []

    async def family_ids_for(self, parent_id: str) -> dict:
        def work() -> dict:
            p = self._db.table("parents").select("family_id,name,honorific,language,phone_e164,is_demo,call_timezone").eq("id", parent_id).maybe_single().execute().data or {}
            owner = self._db.table("family_members").select("user_id").eq("family_id", p.get("family_id", "")).eq("role", "owner").limit(1).execute().data or []
            prof = {}
            if owner:
                prof = self._db.table("profiles").select("full_name,app_language").eq("id", owner[0]["user_id"]).maybe_single().execute().data or {}
            return {**p, "owner_name": prof.get("full_name", ""), "family_language": prof.get("app_language", "en")}

        return await self._run(work)

    # ------------------------------------------------------------ proofs
    async def upload_proof(self, family_id: str, parent_id: str, data: bytes, mime: str) -> str:
        import uuid

        ext = {"image/png": "png", "image/webp": "webp"}.get(mime, "jpg")
        path = f"{family_id}/{parent_id}/{uuid.uuid4().hex}.{ext}"
        await self._run(lambda: self._db.storage.from_("proofs").upload(path, data, {"content-type": mime, "upsert": "true"}))
        return path

    async def save_proof(self, row: dict) -> str:
        r = await self._run(lambda: self._db.table("proofs").insert(row).execute())
        return r.data[0]["id"]

    async def medicine_names(self, parent_id: str) -> list[str]:
        r = await self._run(lambda: self._db.table("medicines").select("name").eq("parent_id", parent_id).eq("active", True).execute())
        return [m["name"] for m in r.data or []]

    # ------------------------------------------------------------ insights
    async def week_signals(self, parent_id: str, since: date) -> dict:
        iso = datetime.combine(since, datetime.min.time(), tzinfo=UTC).isoformat()

        def work() -> dict:
            calls = (
                self._db.table("calls").select("id,status,started_at,purpose,call_summaries(mood,data),call_turns(speaker,text)")
                .eq("parent_id", parent_id).eq("status", "completed").gte("started_at", iso).order("started_at").execute().data or []
            )
            doses = self._db.table("dose_events").select("status,due_at").eq("parent_id", parent_id).gte("due_at", iso).execute().data or []
            vit = self._db.table("vitals").select("kind,value,value2,measured_at,flagged").eq("parent_id", parent_id).gte("measured_at", iso).execute().data or []
            return {"calls": calls, "doses": doses, "vitals": vit}

        return await self._run(work)

    async def save_insight(self, parent_id: str, kind: str, severity: str, title: str, body: str, data: dict, week_start: date) -> bool:
        """Upsert; True if this insight is new this week (so the family is only notified once)."""

        def work() -> bool:
            had = self._db.table("insights").select("id").eq("parent_id", parent_id).eq("kind", kind).eq("week_start", week_start.isoformat()).execute().data
            self._db.table("insights").upsert(
                {"parent_id": parent_id, "kind": kind, "severity": severity, "title": title, "body": body, "data": data, "week_start": week_start.isoformat()},
                on_conflict="parent_id,kind,week_start",
            ).execute()
            return not had

        return await self._run(work)

    async def save_digest(self, parent_id: str, week_start: date, data: dict, summary: str) -> None:
        await self._run(
            lambda: self._db.table("weekly_digests").upsert(
                {"parent_id": parent_id, "week_start": week_start.isoformat(), "data": data, "summary": summary}, on_conflict="parent_id,week_start"
            ).execute()
        )

    async def real_parent_ids(self) -> list[str]:
        r = await self._run(lambda: self._db.table("parents").select("id").eq("is_demo", False).eq("consent_status", "granted").execute())
        return [p["id"] for p in r.data or []]


class NullCare:
    """No database: every care operation is a no-op so dev without Supabase still runs."""

    def _care_profile_extras(self, row: dict) -> dict:
        return {}

    async def ensure_dose_events(self, now=None) -> int:
        return 0

    async def parent_brief(self, *a, **k):
        return None

    async def reminder_candidates(self, *a, **k):
        return [], []

    async def checkin_soon(self, *a, **k) -> bool:
        return False

    async def create_reminder_call(self, *a, **k) -> str:
        return ""

    async def dose_events_for_call(self, *a, **k) -> list[str]:
        return []

    async def open_doses_for_reminder(self, *a, **k) -> list[str]:
        return []

    async def make_dose_due(self, *a, **k):
        return None

    async def mark_missed(self, *a, **k) -> None: ...
    async def confirm_dose(self, *a, **k):
        return None

    async def set_dose_status(self, *a, **k) -> None: ...
    async def deliver_messages(self, *a, **k) -> None: ...
    async def save_message_replies(self, *a, **k) -> None: ...
    async def appointments_to_remind(self) -> list[dict]:
        return []

    async def mark_appointment_reminded(self, *a, **k) -> None: ...
    async def log_vital(self, *a, **k) -> str:
        logger.info(f"[null-store] vital {a} {k}")
        return ""

    async def parent_ranges(self, *a, **k) -> dict:
        return {}

    async def contacts_for(self, *a, **k) -> list[dict]:
        return []

    async def create_escalation(self, *a, **k) -> str:
        return "null-escalation"

    async def add_escalation_event(self, *a, **k) -> None:
        logger.info(f"[null-store] escalation event {a} {k}")

    async def get_escalation(self, *a, **k):
        return {"status": "open"}

    async def resolve_escalation(self, *a, **k) -> None: ...
    async def open_escalations(self, *a, **k) -> list[dict]:
        return []

    async def family_ids_for(self, *a, **k) -> dict:
        return {}

    async def upload_proof(self, *a, **k) -> str:
        return ""

    async def save_proof(self, *a, **k) -> str:
        return ""

    async def medicine_names(self, *a, **k) -> list[str]:
        return []

    async def week_signals(self, *a, **k) -> dict:
        return {"calls": [], "doses": [], "vitals": []}

    async def save_insight(self, *a, **k) -> bool:
        return False

    async def save_digest(self, *a, **k) -> None: ...
    async def real_parent_ids(self) -> list[str]:
        return []

    async def dose_timeline(self, *a, **k) -> list[dict]:
        return []
