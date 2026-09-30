"""Scheduler worker: enqueue due calls, claim with FOR UPDATE SKIP LOCKED (via RPC), dial, retry, notify."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from loguru import logger

from .config import Settings
from .session import PENDING, CallSession
from .store import Store
from .telephony import DialError, TelephonyProvider


class Scheduler:
    def __init__(self, s: Settings, store: Store, telephony: TelephonyProvider | None):
        self.s, self.store, self.tel = s, store, telephony
        self._task: asyncio.Task | None = None
        self._last_daily: str | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        logger.info(f"scheduler started (poll {self.s.scheduler_poll_seconds}s)")
        while True:
            try:
                await self.tick()
            except Exception as e:  # noqa: BLE001 - the loop must survive any single failure
                logger.exception(f"scheduler tick failed: {e}")
            await asyncio.sleep(self.s.scheduler_poll_seconds)

    async def tick(self) -> None:
        ist = datetime.now(UTC) + timedelta(hours=5, minutes=30)
        if ist.hour >= 8 and self._last_daily != ist.date().isoformat():
            self._last_daily = ist.date().isoformat()
            asyncio.create_task(self.store.run_daily_jobs())
        n = await self.store.enqueue_due_calls()
        if n:
            logger.info(f"enqueued {n} due calls")
        for row in await self.store.claim_due_calls(5):
            asyncio.create_task(self._dial(row))

    async def _dial(self, row: dict) -> None:
        call_id, parent_id = row["id"], row["parent_id"]
        log = logger.bind(call_id=call_id)
        if self.tel is None:
            await self.store.update_call(call_id, status="failed", block_reason="other", error_detail="No telephony provider configured")
            return
        profile = await self.store.load_parent(parent_id)
        if profile is None:
            await self.store.update_call(call_id, status="failed", error_detail="parent not found")
            return
        session = CallSession(profile=profile, call_id=call_id, provider=self.tel.name)
        PENDING[call_id] = session
        base = self.s.public_voice_base_url.rstrip("/")
        ws = base.replace("https://", "wss://").replace("http://", "ws://") + "/telephony/ws"
        try:
            pcid = await self.tel.dial(
                to_e164=profile.phone_e164, call_id=call_id, media_ws_url=ws, status_url=f"{base}/telephony/{self.tel.name}/status?call_id={call_id}"
            )
            await self.store.update_call(call_id, provider=self.tel.name, provider_call_id=pcid, status="dialing")
            log.info(f"dialing {profile.name} via {self.tel.name}")
        except DialError as e:
            log.error(f"dial blocked: {e}")
            # Blocked calls (unverified trial number, geo) will not succeed on retry: fail with a visible reason.
            await self.store.update_call(call_id, status="failed", block_reason=str(e.reason), error_code=e.code, error_detail=f"{e.detail} | {e.help}")

    async def handle_no_answer(self, call_id: str, attempt: int, parent_id: str) -> None:
        """Retries: up to call_max_retries, call_retry_minutes apart, then 'missed' + family notice after 2 missed days."""
        if attempt <= self.s.call_max_retries:
            when = (datetime.now(UTC) + timedelta(minutes=self.s.call_retry_minutes)).isoformat()
            await self.store.update_call(call_id, status="queued", next_attempt_at=when)
            logger.bind(call_id=call_id).info(f"no answer, retry {attempt}/{self.s.call_max_retries} at {when}")
            return
        await self.store.update_call(call_id, status="missed")
        missed = await self.store.consecutive_missed_days(parent_id)
        if missed >= 2:
            profile = await self.store.load_parent(parent_id)
            name = profile.honorific if profile else "Your parent"
            await self.store.notify_family(
                parent_id, "missed", f"{name} hasn't picked up for {missed} days",
                "Haalo couldn't reach them on the last calls. It may be worth calling directly.", {"call_id": call_id}, pref="missed",
            )
