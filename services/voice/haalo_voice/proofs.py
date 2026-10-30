"""Photo proof. A parent with a smartphone can open their personal Sneha link (sent by the family) and tap one big camera button.
A vision model reads what is in the photo: a medicine strip or box (matched to the medicines the family listed, which marks the dose
as taken), or a blood-pressure / sugar monitor (the reading is logged, and checked against the family's ranges). Optional, never required."""

from __future__ import annotations

import base64
import json
from typing import Any

import httpx
from loguru import logger

from . import vitals as vt
from .config import Settings
from .doses import match_medicine
from .llm import GROQ_BASE, reasoning_effort

VISION_SYSTEM = """You read one photo that an elderly person sent to their family's health assistant. Be exact and conservative: only report what you can
clearly read. If it is blurry, cut off or you are unsure, say so instead of guessing.
Classify it, then extract:
- "pill": a medicine strip, blister pack, bottle, box or tablets in a hand. Read the medicine name(s) printed on it.
- "bp": a blood pressure monitor display. Read systolic (top), diastolic (bottom) and pulse if shown.
- "sugar": a glucometer display. Read the number and unit.
- "other": anything else.
Return ONLY JSON:
{"kind": "pill|bp|sugar|other", "legible": true|false, "medicines": ["names exactly as printed"], "systolic": number|null, "diastolic": number|null,
 "pulse": number|null, "sugar": number|null, "note": "one short plain sentence about what the photo shows"}"""


def vision_model(s: Settings) -> str:
    return s.groq_model_vision or s.groq_model_conversation


async def read_photo(s: Settings, image: bytes, mime: str, expected: list[str]) -> dict[str, Any]:
    b64 = base64.b64encode(image).decode()
    hint = f"The family listed these medicines: {', '.join(expected)}." if expected else ""
    body: dict[str, Any] = {
        "model": vision_model(s),
        "messages": [
            {"role": "system", "content": VISION_SYSTEM},
            {"role": "user", "content": [{"type": "text", "text": hint or "Read this photo."}, {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}]},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
        "max_completion_tokens": 500,
    }
    if (eff := reasoning_effort(vision_model(s))):
        body["reasoning_effort"] = eff
    async with httpx.AsyncClient(timeout=45) as c:
        r = await c.post(f"{GROQ_BASE}/chat/completions", headers={"Authorization": f"Bearer {s.groq_api_key}"}, json=body)
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


async def handle_photo(s: Settings, store: Any, parent_id: str, image: bytes, mime: str, *, uploaded_by: str = "parent_link") -> dict[str, Any]:
    """Analyse, store and act on a photo. Returns what happened, in plain words, for the parent-facing page."""
    info = await store.family_ids_for(parent_id)
    if not info:
        raise ValueError("unknown parent")
    expected = await store.medicine_names(parent_id)
    result = await read_photo(s, image, mime, expected)
    kind = result.get("kind") if result.get("kind") in ("pill", "bp", "sugar", "other") else "other"
    who = info.get("honorific") or info.get("name") or "Your parent"
    path = await store.upload_proof(info["family_id"], parent_id, image, mime)
    row: dict[str, Any] = {"parent_id": parent_id, "kind": kind, "storage_path": path, "extracted": result, "uploaded_by": uploaded_by, "summary": result.get("note", "")}
    outcome = {"kind": kind, "message": "Thank you. I have passed this to the family.", "legible": bool(result.get("legible", True))}

    if not result.get("legible", True):
        row["summary"] = "The photo was not clear enough to read."
        outcome["message"] = "The photo was a bit blurry. Please try once more in good light."
        await store.save_proof(row)
        return outcome

    tz = info.get("call_timezone") or "Asia/Kolkata"
    if kind == "pill":
        hits = [m for name in result.get("medicines") or [] if (m := match_medicine(str(name), expected))]
        done: list[str] = []
        proof_id = None
        for m in dict.fromkeys(hits):
            confirmed = await store.confirm_dose(parent_id, m, tz, via="photo")
            if confirmed:
                done.append(confirmed["medicine"])
        proof_id = await store.save_proof({**row, "summary": f"Photo of {', '.join(hits) or 'a medicine'}" + (f"; marked {', '.join(done)} as taken" if done else "")})
        if done:
            await store.notify_family(parent_id, "dose", f"{who} took {', '.join(done)}", "Confirmed with a photo.", {"url": "/medicines", "proof_id": proof_id}, pref="summary")
            outcome["message"] = f"Thank you! I have noted {', '.join(done)}."
        else:
            outcome["message"] = "Thank you. I could not match it to a dose that is due now, but I have passed the photo to the family."
        outcome["medicines"] = hits
        return outcome

    if kind in ("bp", "sugar"):
        if kind == "bp" and result.get("systolic") and result.get("diastolic"):
            val, val2, unit = vt.normalize("bp", float(result["systolic"]), float(result["diastolic"])) + (vt.UNITS["bp"],)
        elif kind == "sugar" and result.get("sugar"):
            val, val2, unit = float(result["sugar"]), None, vt.UNITS["sugar"]
        else:
            await store.save_proof(row)
            outcome["message"] = "I could not read the number. Please try again, with the display filling the photo."
            return outcome
        ranges = await store.parent_ranges(parent_id)
        verdict = vt.evaluate(kind, val, val2, ranges)
        proof_id = await store.save_proof({**row, "summary": f"{vt.LABELS[kind].capitalize()} {vt.describe(kind, val, val2)}"})
        await store.log_vital(parent_id, kind, val, val2, unit, source="photo", proof_id=proof_id, flagged=verdict.flagged)
        if kind == "bp" and result.get("pulse"):
            await store.log_vital(parent_id, "pulse", float(result["pulse"]), None, vt.UNITS["pulse"], source="photo", proof_id=proof_id)
        title = f"{who}'s {vt.LABELS[kind]}: {vt.describe(kind, val, val2)}"
        await store.notify_family(
            parent_id, "vital", title + (" - outside the usual range" if verdict.flagged else ""),
            (verdict.reason.capitalize() + ". " if verdict.flagged else "In the usual range. ") + "Read from a photo they sent.",
            {"url": "/health", "proof_id": proof_id}, pref="emergency" if verdict.severity == "high" else "summary",
        )
        outcome["message"] = f"Thank you. I noted {vt.describe(kind, val, val2)} and told the family."
        outcome["reading"] = vt.describe(kind, val, val2)
        return outcome

    await store.save_proof(row)
    logger.info("photo proof stored (kind=other)")
    return outcome
