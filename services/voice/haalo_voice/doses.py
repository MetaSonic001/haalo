"""Dose scheduling: turn each medicine's times ("morning", "08:00", "8:30 pm") into dated dose events, and decide which ones
need a reminder call, which count as missed, and which medicines are running low. Pure functions here; the engine that acts on
them is in `reminders.py`."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Words the family uses in the add-parent wizard, mapped to a sensible clock time.
TIME_WORDS: dict[str, time] = {
    "morning": time(8, 30), "breakfast": time(8, 30), "fasting": time(7, 0), "before breakfast": time(7, 30),
    "afternoon": time(13, 30), "lunch": time(13, 30), "noon": time(13, 0),
    "evening": time(18, 30), "tea": time(17, 30),
    "dinner": time(20, 0), "night": time(21, 30), "bedtime": time(21, 30),
}

_CLOCK = re.compile(r"^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$", re.I)


def parse_time(label: str) -> time | None:
    """'morning' -> 08:30, '8am' -> 08:00, '20:15' -> 20:15, '8:30 pm' -> 20:30. Unknown labels return None."""
    key = label.strip().lower()
    if key in TIME_WORDS:
        return TIME_WORDS[key]
    m = _CLOCK.match(key)
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").replace(".", "").lower()
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return time(h, mi)


def dose_datetimes(times: list[str], day: date, tz: str) -> list[datetime]:
    """UTC due datetimes on `day` (local date in tz) for a medicine's time labels, sorted, de-duplicated."""
    zone = ZoneInfo(tz)
    out: set[datetime] = set()
    for label in times:
        t = parse_time(label)
        if t:
            out.add(datetime.combine(day, t, tzinfo=zone).astimezone(UTC))
    return sorted(out)


def local_label(due: datetime, tz: str) -> str:
    """'8:30 am' in the parent's timezone."""
    local = due.astimezone(ZoneInfo(tz))
    return local.strftime("%I:%M %p").lstrip("0").lower()


def days_of_stock(stock: int | None, pills_per_dose: int, doses_per_day: int) -> float | None:
    if stock is None or doses_per_day <= 0:
        return None
    return stock / max(1, pills_per_dose * doses_per_day)


def needs_refill(stock: int | None, pills_per_dose: int, doses_per_day: int, threshold_days: int = 5) -> bool:
    d = days_of_stock(stock, pills_per_dose, doses_per_day)
    return d is not None and d <= threshold_days


def match_medicine(name: str, candidates: list[str]) -> str | None:
    """Fuzzy match what the parent or the model said ('BP wali goli', 'amlodipine') to a stored medicine name."""
    from difflib import SequenceMatcher

    n = name.strip().lower()
    if not n:
        return None
    for c in candidates:
        if c.lower() == n or c.lower() in n or n in c.lower():
            return c
    best, score = None, 0.0
    for c in candidates:
        r = SequenceMatcher(None, n, c.lower()).ratio()
        if r > score:
            best, score = c, r
    return best if score >= 0.72 else None


def window_state(due: datetime, now: datetime, missed_after_min: int) -> str:
    """'upcoming' before the due time, 'open' while it can still be taken, 'overdue' after the grace window."""
    if now < due:
        return "upcoming"
    return "open" if now < due + timedelta(minutes=missed_after_min) else "overdue"


def week_start(d: date) -> date:
    """Monday of d's week."""
    return d - timedelta(days=d.weekday())
