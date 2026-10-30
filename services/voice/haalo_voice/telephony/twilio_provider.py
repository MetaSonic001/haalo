"""Twilio adapter: outbound via REST with inline TwiML <Connect><Stream>, inbound via answer webhook.

Trial account behaviour (documented, handled):
- only Verified Caller IDs can be called (error 21219)
- destination country must be enabled in Geo permissions (error 21215)
- a trial message plays first and the callee must press a key to continue
- calls cap at 10 minutes
"""

from __future__ import annotations

import asyncio
from xml.sax.saxutils import quoteattr

from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.serializers.twilio import TwilioFrameSerializer
from twilio.base.exceptions import TwilioRestException
from twilio.request_validator import RequestValidator
from twilio.rest import Client

from ..config import Settings
from .base import BlockReason, CallOutcome, DialError, StatusUpdate, TelephonyProvider

_ERROR_MAP = {
    "21219": BlockReason.TRIAL_UNVERIFIED_NUMBER,
    "21215": BlockReason.GEO_PERMISSION,
    "21211": BlockReason.INVALID_NUMBER,
    "21214": BlockReason.INVALID_NUMBER,
    "20003": BlockReason.AUTH,
}

_STATUS_MAP = {
    "queued": CallOutcome.QUEUED,
    "initiated": CallOutcome.DIALING,
    "ringing": CallOutcome.DIALING,
    "in-progress": CallOutcome.IN_PROGRESS,
    "completed": CallOutcome.COMPLETED,
    "busy": CallOutcome.NO_ANSWER,
    "no-answer": CallOutcome.NO_ANSWER,
    "canceled": CallOutcome.FAILED,
    "failed": CallOutcome.FAILED,
}


def _twiml(media_ws_url: str, params: dict[str, str]) -> str:
    ps = "".join(f"<Parameter name={quoteattr(k)} value={quoteattr(v)} />" for k, v in params.items())
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Connect><Stream url={quoteattr(media_ws_url)}>{ps}</Stream></Connect></Response>"
    )


class TwilioProvider(TelephonyProvider):
    name = "twilio"

    def __init__(self, s: Settings):
        if not (s.twilio_account_sid and s.twilio_auth_token and s.twilio_phone_number):
            raise ValueError("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are required")
        self._s = s
        self._client = Client(s.twilio_account_sid, s.twilio_auth_token)
        self._validator = RequestValidator(s.twilio_auth_token)

    @property
    def sample_rate(self) -> int:
        return 8000

    async def dial(self, *, to_e164: str, call_id: str, media_ws_url: str, status_url: str) -> str:
        twiml = _twiml(media_ws_url, {"call_id": call_id, "to_number": to_e164})
        limit = self._s.max_call_minutes * 60

        def _create() -> str:
            call = self._client.calls.create(
                to=to_e164,
                from_=self._s.twilio_phone_number,
                twiml=twiml,
                status_callback=status_url,
                status_callback_method="POST",
                status_callback_event=["initiated", "ringing", "answered", "completed"],
                time_limit=limit,
            )
            return call.sid

        try:
            return await asyncio.to_thread(_create)
        except TwilioRestException as e:
            code = str(e.code) if e.code else None
            reason = _ERROR_MAP.get(code or "", BlockReason.OTHER)
            raise DialError(reason, e.msg or str(e), code) from e

    async def alert_call(self, *, to_e164: str, say_text: str, ack_url: str, language: str = "en-IN") -> str:
        """Reads the alert twice; pressing 1 posts to ack_url (the escalation is then marked acknowledged)."""
        from xml.sax.saxutils import escape

        say = f'<Say language={quoteattr(language)} voice="Polly.Aditi">{escape(say_text)}</Say>'
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?><Response>'
            f"<Gather numDigits=\"1\" action={quoteattr(ack_url)} method=\"POST\" timeout=\"8\">{say}</Gather>"
            f"<Gather numDigits=\"1\" action={quoteattr(ack_url)} method=\"POST\" timeout=\"8\">{say}</Gather>"
            "</Response>"
        )

        def _create() -> str:
            return self._client.calls.create(to=to_e164, from_=self._s.twilio_phone_number, twiml=twiml, time_limit=120).sid

        try:
            return await asyncio.to_thread(_create)
        except TwilioRestException as e:
            code = str(e.code) if e.code else None
            raise DialError(_ERROR_MAP.get(code or "", BlockReason.OTHER), e.msg or str(e), code) from e

    async def send_sms(self, *, to_e164: str, body: str) -> str:
        def _send() -> str:
            return self._client.messages.create(to=to_e164, from_=self._s.twilio_phone_number, body=body[:600]).sid

        try:
            return await asyncio.to_thread(_send)
        except TwilioRestException as e:
            code = str(e.code) if e.code else None
            raise DialError(_ERROR_MAP.get(code or "", BlockReason.OTHER), e.msg or str(e), code) from e

    def answer_document(self, *, media_ws_url: str, params: dict[str, str]) -> tuple[str, str]:
        return _twiml(media_ws_url, params), "application/xml"

    def make_serializer(self, *, stream_id: str, provider_call_id: str) -> FrameSerializer:
        return TwilioFrameSerializer(
            stream_sid=stream_id,
            call_sid=provider_call_id,
            account_sid=self._s.twilio_account_sid,
            auth_token=self._s.twilio_auth_token,
            params=TwilioFrameSerializer.InputParams(auto_hang_up=True),
        )

    async def hangup(self, provider_call_id: str) -> None:
        await asyncio.to_thread(lambda: self._client.calls(provider_call_id).update(status="completed"))

    def parse_status(self, form: dict[str, str]) -> StatusUpdate:
        outcome = _STATUS_MAP.get(form.get("CallStatus", ""), CallOutcome.FAILED)
        code = form.get("ErrorCode") or None
        dur = form.get("CallDuration")
        return StatusUpdate(
            provider_call_id=form.get("CallSid", ""),
            outcome=outcome,
            duration_s=int(dur) if dur and dur.isdigit() else None,
            error_code=code,
            block_reason=_ERROR_MAP.get(code or "") if code else None,
        )

    def verify_webhook(self, *, url: str, form: dict[str, str], signature: str) -> bool:
        return self._validator.validate(url, form, signature)
