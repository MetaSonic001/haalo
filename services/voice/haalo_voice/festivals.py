"""Festival and birthday greetings. Sneha only wishes a festival the family chose a tradition for (parents.tradition), so a
Diwali wish never reaches a Muslim parent and an Eid wish never reaches a Hindu one. National days and birthdays go to everyone.
Dates come from the `holidays` package (India), which also carries state-specific holidays."""

from __future__ import annotations

from datetime import date

import holidays

# Language -> state code for regional festivals (best effort; the parent's real state is not collected).
REGION = {"mr": "MH", "ta": "TN", "te": "TG", "kn": "KA", "ml": "KL", "gu": "GJ", "bn": "WB", "hi": None, "en": None}

_TRADITIONS: dict[str, tuple[str, ...]] = {
    "hindu": ("diwali", "deepavali", "holi", "ram navami", "janmashtami", "dussehra", "shivaratri", "ganesh", "navratri", "pongal", "makar sankranti",
              "ugadi", "gudi padwa", "onam", "vishu", "raksha bandhan", "vasant panchami", "durga", "tamil new year", "vijayadashami", "rama"),
    "muslim": ("id-ul", "eid", "bakrid", "muharram", "milad", "ramzan", "ramadan"),
    "christian": ("christmas", "good friday", "easter"),
    "sikh": ("guru nanak", "guru gobind", "baisakhi", "vaisakhi", "guru"),
    "jain": ("mahavir",),
    "buddhist": ("buddha",),
}
_NATIONAL = ("republic day", "independence day", "gandhi")


def _belongs(name: str, tradition: str) -> bool:
    n = name.lower()
    if any(k in n for k in _NATIONAL):
        return True
    return bool(tradition) and any(k in n for k in _TRADITIONS.get(tradition, ()))


def occasions_on(day: date, *, language: str, tradition: str, birthday: date | str | None, parent_name: str = "") -> list[str]:
    """Plain-English lines for the system prompt: what to warmly mention today, if anything."""
    out: list[str] = []
    cal = holidays.India(subdiv=REGION.get(language), years=[day.year], language="en_IN")
    for name in str(cal.get(day, "")).split("; "):
        if name and _belongs(name, tradition):
            out.append(f"Today is {name}. Wish them warmly, and ask how they are celebrating or marking it.")
    if birthday:
        b = date.fromisoformat(birthday) if isinstance(birthday, str) else birthday
        if (b.month, b.day) == (day.month, day.day):
            age = day.year - b.year
            whose = f"{parent_name}'s" if parent_name else "their"
            out.append(f"Today is {whose} birthday ({age} years). Wish them a very happy birthday first, warmly, before anything else.")
    return out


def upcoming(day: date, *, language: str, tradition: str, within_days: int = 14) -> list[tuple[date, str]]:
    """Festivals in the next `within_days` that match the tradition, for the family-facing calendar."""
    from datetime import timedelta

    cal = holidays.India(subdiv=REGION.get(language), years=[day.year, day.year + 1], language="en_IN")
    found: list[tuple[date, str]] = []
    for i in range(within_days + 1):
        d = day + timedelta(days=i)
        for name in str(cal.get(d, "")).split("; "):
            if name and _belongs(name, tradition):
                found.append((d, name.replace(" (estimated)", "")))
    return found
