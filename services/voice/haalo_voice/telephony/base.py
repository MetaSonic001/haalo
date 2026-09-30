"""TelephonyProvider interface. The bot only ever sees this; switching provider = TELEPHONY_PROVIDER env."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum

from pipecat.serializers.base_serializer import FrameSerializer


class CallOutcome(StrEnum):
    QUEUED = "queued"
    DIALING = "dialing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    NO_ANSWER = "no_answer"
    FAILED = "failed"


class BlockReason(StrEnum):
    """Why a dial was blocked. Surfaced verbatim in /admin so it is never a mystery."""

    TRIAL_UNVERIFIED_NUMBER = "trial_unverified_number"
    GEO_PERMISSION = "geo_permission"
    INVALID_NUMBER = "invalid_number"
    AUTH = "auth"
    OTHER = "other"


REASON_HELP = {
    BlockReason.TRIAL_UNVERIFIED_NUMBER: "Twilio trial accounts can only call verified numbers. "
    "Verify this number in the Twilio console (Verified Caller IDs) or upgrade the account.",
    BlockReason.GEO_PERMISSION: "Twilio blocked this destination country. Enable it under "
    "Voice > Geo permissions in the Twilio console.",
    BlockReason.INVALID_NUMBER: "The number is not valid. Check it includes the country code, e.g. +91.",
    BlockReason.AUTH: "Telephony credentials were rejected. Check the account SID and auth token in .env.",
    BlockReason.OTHER: "The telephony provider rejected the call. See the provider error detail.",
}


class DialError(Exception):
    def __init__(self, reason: BlockReason, detail: str, code: str | None = None):
        super().__init__(f"{reason}: {detail}")
        self.reason, self.detail, self.code = reason, detail, code

    @property
    def help(self) -> str:
        return REASON_HELP[self.reason]


@dataclass(frozen=True)
class StatusUpdate:
    provider_call_id: str
    outcome: CallOutcome
    duration_s: int | None = None
    error_code: str | None = None
    block_reason: BlockReason | None = None


class TelephonyProvider(ABC):
    name: str

    @abstractmethod
    async def dial(self, *, to_e164: str, call_id: str, media_ws_url: str, status_url: str) -> str:
        """Place an outbound call whose media streams to media_ws_url. Returns provider_call_id."""

    @abstractmethod
    def answer_document(self, *, media_ws_url: str, params: dict[str, str]) -> tuple[str, str]:
        """Answer-webhook body for inbound calls (or inline for outbound): (body, media_type)."""

    @abstractmethod
    def make_serializer(self, *, stream_id: str, provider_call_id: str) -> FrameSerializer: ...

    @abstractmethod
    async def hangup(self, provider_call_id: str) -> None: ...

    @abstractmethod
    def parse_status(self, form: dict[str, str]) -> StatusUpdate: ...

    @abstractmethod
    def verify_webhook(self, *, url: str, form: dict[str, str], signature: str) -> bool: ...

    @property
    @abstractmethod
    def sample_rate(self) -> int:
        """Native audio rate on the wire (8000 for PSTN)."""
