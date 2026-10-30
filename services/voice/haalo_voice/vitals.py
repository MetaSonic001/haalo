"""Health readings the parent says on a call or shows in a photo. Sneha only records them and tells the family when a number is
outside the family's agreed range. It never interprets a number medically: the ranges are alert thresholds, not diagnoses, and
every one can be changed per parent (parents.vital_ranges)."""

from __future__ import annotations

from dataclasses import dataclass

KINDS = ("bp", "sugar", "weight", "temperature", "spo2", "pulse")
UNITS = {"bp": "mmHg", "sugar": "mg/dL", "weight": "kg", "temperature": "°F", "spo2": "%", "pulse": "bpm"}

# Alert thresholds ("tell the family"), not clinical targets. Per-parent overrides: {"bp": {"sys_high": 150}, ...}
DEFAULT_RANGES: dict[str, dict[str, float]] = {
    "bp": {"sys_high": 160, "sys_low": 90, "dia_high": 100, "dia_low": 50, "urgent_sys": 180, "urgent_dia": 120},
    "sugar": {"high": 250, "low": 70, "urgent_low": 54},
    "temperature": {"high": 100.4},
    "spo2": {"low": 93, "urgent_low": 90},
    "pulse": {"high": 120, "low": 50},
    "weight": {},
}

LABELS = {"bp": "blood pressure", "sugar": "blood sugar", "weight": "weight", "temperature": "temperature", "spo2": "oxygen level", "pulse": "pulse"}


@dataclass(frozen=True)
class Verdict:
    flagged: bool
    severity: str  # none | medium | high
    reason: str


def ranges_for(kind: str, overrides: dict | None) -> dict[str, float]:
    return {**DEFAULT_RANGES.get(kind, {}), **((overrides or {}).get(kind) or {})}


def normalize(kind: str, value: float, value2: float | None = None) -> tuple[float, float | None]:
    """Fix obvious unit slips so a number is not misread: Celsius said for temperature, a BP said as e.g. 13080."""
    if kind == "temperature" and value < 50:  # Celsius
        value = round(value * 9 / 5 + 32, 1)
    if kind == "bp" and value2 is not None and value < value2:  # said in the wrong order
        value, value2 = value2, value
    return value, value2


def evaluate(kind: str, value: float, value2: float | None = None, overrides: dict | None = None) -> Verdict:
    r = ranges_for(kind, overrides)
    if kind == "bp" and value2 is not None:
        if value >= r["urgent_sys"] or value2 >= r["urgent_dia"]:
            return Verdict(True, "high", f"blood pressure {value:.0f}/{value2:.0f} is very high")
        if value >= r["sys_high"] or value2 >= r["dia_high"]:
            return Verdict(True, "medium", f"blood pressure {value:.0f}/{value2:.0f} is above the usual range")
        if value <= r["sys_low"] or value2 <= r["dia_low"]:
            return Verdict(True, "medium", f"blood pressure {value:.0f}/{value2:.0f} is lower than usual")
    elif kind == "sugar":
        if value <= r.get("urgent_low", 0):
            return Verdict(True, "high", f"blood sugar {value:.0f} is very low")
        if value >= r["high"]:
            return Verdict(True, "medium", f"blood sugar {value:.0f} is high")
        if value <= r["low"]:
            return Verdict(True, "medium", f"blood sugar {value:.0f} is low")
    elif kind == "temperature" and value >= r["high"]:
        return Verdict(True, "medium", f"temperature {value:.1f}°F suggests a fever")
    elif kind == "spo2":
        if value <= r["urgent_low"]:
            return Verdict(True, "high", f"oxygen level {value:.0f}% is low")
        if value <= r["low"]:
            return Verdict(True, "medium", f"oxygen level {value:.0f}% is a little low")
    elif kind == "pulse":
        if value >= r["high"]:
            return Verdict(True, "medium", f"pulse {value:.0f} is fast")
        if value <= r["low"]:
            return Verdict(True, "medium", f"pulse {value:.0f} is slow")
    return Verdict(False, "none", "")


def describe(kind: str, value: float, value2: float | None = None) -> str:
    if kind == "bp" and value2 is not None:
        return f"{value:.0f}/{value2:.0f} mmHg"
    unit = UNITS.get(kind, "")
    num = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{num} {unit}".strip()
