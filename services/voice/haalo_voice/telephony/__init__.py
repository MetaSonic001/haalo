from __future__ import annotations

from ..config import Settings
from .base import BlockReason, CallOutcome, DialError, StatusUpdate, TelephonyProvider


def build_telephony(s: Settings) -> TelephonyProvider:
    """Select the provider from TELEPHONY_PROVIDER. Adding one = a new adapter + a branch here."""
    name = s.telephony_provider.lower()
    if name == "twilio":
        from .twilio_provider import TwilioProvider

        return TwilioProvider(s)
    if name in ("exotel", "plivo"):
        raise NotImplementedError(
            f"'{name}' adapter is planned for the pre-paying-customers step; it needs a verified "
            "read of the provider REST docs first. Use TELEPHONY_PROVIDER=twilio for now."
        )
    raise ValueError(f"Unknown TELEPHONY_PROVIDER '{s.telephony_provider}'")


__all__ = ["BlockReason", "CallOutcome", "DialError", "StatusUpdate", "TelephonyProvider", "build_telephony"]
