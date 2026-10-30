"""The care tick, run by the scheduler every poll: create today's dose events, call parents whose dose is due, mark doses missed, tell the
family about tomorrow's appointments, and keep a daily insight job. Sandbox (demo workspace) parents are never called."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any

from loguru import logger

from .config import Settings
from .escalation import Escalator


class CareEngine:
    def __init__(self, s: Settings, store: Any, escalator: Escalator):
        self.s, self.store, self.esc = s, store, escalator
        self._last_insights: str | None = None

    async def tick(self, now: datetime | None = None, *, can_call: bool = True) -> dict[str, int]:
        """`can_call` is False when no telephony number is connected: dose events and appointment notices still run, but no reminder
        is attempted and no dose is marked missed, because Sneha could not have reminded anyone."""
        now = now or datetime.now(UTC)
        stats = {"events": 0, "reminders": 0, "missed": 0, "appointments": 0}
        stats["events"] = await self.store.ensure_dose_events(now)
        stats["appointments"] = await self._appointments()
        if not can_call:
            return stats
        remind, missed = await self.store.reminder_candidates(
            now, self.s.dose_remind_retry_minutes, self.s.dose_missed_after_minutes, self.s.dose_max_reminders
        )
        by_parent: dict[str, list[dict]] = defaultdict(list)
        for r in remind:
            by_parent[r["parent_id"]].append(r)
        for pid, rows in by_parent.items():
            # A check-in call is about to happen: it asks about the dose, so no separate reminder call.
            if await self.store.checkin_soon(pid, self.s.dose_fold_into_checkin_minutes):
                continue
            await self.store.create_reminder_call(pid, [r["id"] for r in rows])
            stats["reminders"] += 1
            logger.info(f"dose reminder call queued for {pid}: {[(r['medicines'] or {}).get('name') for r in rows]}")
        stats["missed"] = await self._handle_missed(missed)
        return stats

    async def _handle_missed(self, missed: list[dict]) -> int:
        if not missed:
            return 0
        await self.store.mark_missed([m["id"] for m in missed])
        by_parent: dict[str, list[dict]] = defaultdict(list)
        for m in missed:
            by_parent[m["parent_id"]].append(m)
        for pid, rows in by_parent.items():
            par = rows[0].get("parents") or {}
            who = par.get("honorific") or par.get("name") or "Your parent"
            names = sorted({(r.get("medicines") or {}).get("name", "a medicine") for r in rows})
            critical = [n for r in rows if (r.get("medicines") or {}).get("critical") for n in [(r["medicines"] or {}).get("name")]]
            listed = ", ".join(names)
            await self.store.notify_family(
                pid, "missed", f"{who} hasn't confirmed {listed}",
                "Sneha reminded them but didn't hear back that it was taken. It may be worth a call.",
                {"url": "/medicines", "kind": "missed_dose"}, pref="missed",
            )
            if critical:
                await self.esc.start(pid, "missed_dose", f"{who} has not confirmed {', '.join(sorted(set(critical)))}, which the family marked as important.")
        return len(missed)

    async def _appointments(self) -> int:
        n = 0
        for a in await self.store.appointments_to_remind():
            par = a.get("parents") or {}
            who = par.get("honorific") or par.get("name") or "Your parent"
            at = datetime.fromisoformat(a["at"])
            await self.store.notify_family(
                a["parent_id"], "reminder", f"{who} has an appointment soon",
                f"{a['title']}{' with ' + a['doctor'] if a.get('doctor') else ''} at {at.astimezone().strftime('%d %b, %I:%M %p').lstrip('0')}. "
                "Sneha will remind them on the call.",
                {"url": "/calendar"}, pref="summary",
            )
            await self.store.mark_appointment_reminded(a["id"])
            n += 1
        return n

    async def daily(self, today: date) -> None:
        """Once a day: weekly-style trend insights for every real parent."""
        if self._last_insights == today.isoformat():
            return
        self._last_insights = today.isoformat()
        from .insights import compute_for_parent

        for pid in await self.store.real_parent_ids():
            try:
                await compute_for_parent(self.s, self.store, pid, today)
            except Exception as e:  # noqa: BLE001 - one parent's failure must not stop the others
                logger.warning(f"insights failed for {pid}: {e}")
