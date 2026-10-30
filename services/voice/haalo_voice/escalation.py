"""The escalation ladder. When something may be seriously wrong (an emergency said on a call, days of unanswered calls, a missed critical
dose, the parent asking for the family) Sneha does not just send one notification:

  step 0  push + in-app alert to the whole family at once
  step 1+ every emergency contact, in priority order: an alert call that reads the message aloud (press 1 to confirm) plus an SMS,
          waiting `escalation_step_seconds` for an acknowledgement before moving to the next person
  finally a last push telling the family that nobody has confirmed and to call 112

It stops the moment anyone acknowledges (web, mobile, or pressing 1 on the call). Without a telephony number the calls/SMS steps are
recorded as `simulated`, never as sent, so the dashboard is honest about what actually happened."""

from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from .config import Settings
from .telephony import DialError, TelephonyProvider

TRIGGER_TITLES = {
    "emergency": "may need urgent help",
    "missed_calls": "has not answered for days",
    "missed_dose": "missed an important medicine",
    "parent_request": "asked for the family",
    "manual_test": "(test alert)",
}


def alert_text(honorific: str, trigger: str, summary: str) -> str:
    return f"Sneha alert. {honorific} {TRIGGER_TITLES.get(trigger, 'may need help')}. {summary} Please call them now."


class Escalator:
    def __init__(self, s: Settings, store: Any, tel: TelephonyProvider | None):
        self.s, self.store, self.tel = s, store, tel
        self._tasks: dict[str, asyncio.Task] = {}

    # ---------------------------------------------------------------- public
    async def start(
        self, parent_id: str, trigger: str, summary: str, *, flag_id: str | None = None, call_id: str | None = None,
        step_seconds: float | None = None,
    ) -> str:
        """Open an escalation (one open escalation per parent+trigger at a time) and run the ladder in the background."""
        info = await self.store.family_ids_for(parent_id)
        existing = [e for e in await self.store.open_escalations(1) if e["parent_id"] == parent_id and e["trigger"] == trigger]
        if existing and trigger != "manual_test":
            return existing[0]["id"]
        if step_seconds is None and info.get("is_demo"):
            step_seconds = 12  # the demo workspace shows the whole ladder in under a minute
        esc_id = await self.store.create_escalation(parent_id, trigger, summary, flag_id=flag_id, call_id=call_id)
        self._launch(esc_id, parent_id, trigger, summary, info, step_seconds, from_contact=0)
        return esc_id

    async def resume(self) -> int:
        """After a restart, continue ladders that were still running."""
        n = 0
        for e in await self.store.open_escalations(3):
            if e["id"] in self._tasks:
                continue
            done_calls = len({x["step"] for x in e.get("escalation_events", []) if x["step"] > 0 and x["step"] < 99})
            info = await self.store.family_ids_for(e["parent_id"])
            self._launch(e["id"], e["parent_id"], e["trigger"], e["summary"], info, None, from_contact=done_calls)
            n += 1
        return n

    async def acknowledge(self, esc_id: str, by: str) -> None:
        await self.store.resolve_escalation(esc_id, by)
        logger.info(f"escalation {esc_id} acknowledged by {by}")

    # ---------------------------------------------------------------- ladder
    def _launch(self, esc_id: str, parent_id: str, trigger: str, summary: str, info: dict, step_seconds: float | None, *, from_contact: int) -> None:
        task = asyncio.create_task(self._run(esc_id, parent_id, trigger, summary, info, step_seconds, from_contact))
        self._tasks[esc_id] = task
        task.add_done_callback(lambda _t: self._tasks.pop(esc_id, None))

    async def _open(self, esc_id: str) -> bool:
        e = await self.store.get_escalation(esc_id)
        return bool(e) and e.get("status") == "open"

    async def _wait(self, esc_id: str, seconds: float) -> bool:
        """Sleep up to `seconds`, returning early (True) if the escalation was acknowledged."""
        waited = 0.0
        while waited < seconds:
            await asyncio.sleep(min(2.0, seconds - waited))
            waited += 2.0
            if not await self._open(esc_id):
                return True
        return False

    async def _run(self, esc_id: str, parent_id: str, trigger: str, summary: str, info: dict, step_seconds: float | None, from_contact: int) -> None:
        log = logger.bind(call_id="-")
        wait_s = step_seconds if step_seconds is not None else self.s.escalation_step_seconds
        honorific = info.get("honorific") or info.get("name") or "Your parent"
        try:
            if from_contact == 0:
                await self.store.notify_family(
                    parent_id, "flag", f"{honorific} {TRIGGER_TITLES.get(trigger, 'may need help')}",
                    f"{summary} Sneha is alerting your emergency contacts if nobody responds.",
                    {"url": "/safety", "trigger": trigger, "escalation_id": esc_id, "severity": "emergency"}, pref="emergency",
                )
                await self.store.add_escalation_event(esc_id, 0, "family_push", "Everyone in the family", "sent", "Push and in-app alert sent to all family members")
            contacts = await self.store.contacts_for(parent_id)
            if from_contact == 0 and await self._wait(esc_id, wait_s):
                return
            for i, c in enumerate(contacts[from_contact:], start=from_contact + 1):
                if not await self._open(esc_id):
                    return
                await self._alert_contact(esc_id, i, c, honorific, trigger, summary)
                if await self._wait(esc_id, wait_s):
                    return
            if await self._open(esc_id):
                await self.store.notify_family(
                    parent_id, "flag", f"Nobody has confirmed about {honorific}",
                    f"{summary} If you cannot reach them, call 112 (India's emergency number) or a neighbour right away.",
                    {"url": "/safety", "trigger": trigger, "escalation_id": esc_id, "severity": "emergency"}, pref="emergency",
                )
                await self.store.add_escalation_event(esc_id, 98, "family_push", "Everyone in the family", "sent", "Final alert: nobody confirmed; call 112")
        except Exception as e:  # noqa: BLE001 - one failed step must not abandon the ladder silently
            log.exception(f"escalation {esc_id} failed: {e}")
            await self.store.add_escalation_event(esc_id, 97, "family_push", "System", "failed", f"Escalation error: {e}")

    async def _alert_contact(self, esc_id: str, step: int, c: dict, honorific: str, trigger: str, summary: str) -> None:
        text = alert_text(honorific, trigger, summary)
        who = f"{c['name']}" + (f" ({c['relation']})" if c.get("relation") else "")
        base = self.s.public_voice_base_url.rstrip("/")
        ack = f"{base}/telephony/ack?esc={esc_id}&contact={c['id']}" if base else ""
        if self.tel is None or not self.s.public_voice_base_url:
            await self.store.add_escalation_event(
                esc_id, step, "call", who, "simulated", "No calling number connected yet, so no real call was placed.", c["id"]
            )
            await self.store.add_escalation_event(esc_id, step, "sms", who, "simulated", "No SMS was sent (no calling number connected).", c["id"])
            return
        try:
            await self.tel.alert_call(to_e164=c["phone_e164"], say_text=text, ack_url=ack)
            await self.store.add_escalation_event(esc_id, step, "call", who, "sent", "Alert call placed; waiting for them to press 1", c["id"])
        except (DialError, NotImplementedError) as e:
            await self.store.add_escalation_event(esc_id, step, "call", who, "failed", str(e)[:200], c["id"])
        try:
            await self.tel.send_sms(to_e164=c["phone_e164"], body=text)
            await self.store.add_escalation_event(esc_id, step, "sms", who, "sent", "SMS sent", c["id"])
        except (DialError, NotImplementedError) as e:
            await self.store.add_escalation_event(esc_id, step, "sms", who, "failed", str(e)[:200], c["id"])
