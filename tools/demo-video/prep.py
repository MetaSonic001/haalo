"""Prepare a recording: reset the demo workspace to a fresh month, synthesise the parents' spoken lines, write state.json.

    cd services/voice && uv run python ../../tools/demo-video/prep.py

The parents' lines are synthesised speech (Edge TTS, dev only), played into the browser as if from the microphone, so the live
calls in the video are real calls against the real voice service.
"""

from __future__ import annotations

import asyncio
import json
import wave
from pathlib import Path

import edge_tts
import miniaudio

from haalo_voice.config import get_settings
from haalo_voice.demo_seed import seed
from haalo_voice.languages import get_language

HERE = Path(__file__).resolve().parent
AUDIO = HERE / "audio"
RATE = 24000

LINES = {
    "aai_reminder": {
        "lang": "mr", "gender": "female",
        "lines": ["हो, मी बीपीची गोळी घेतली", "मला छान वाटतंय, धन्यवाद"],
    },
    "aai_checkin": {
        "lang": "mr", "gender": "female",
        "lines": [
            "मी छान आहे, आज सकाळी औषध घेतलं",
            "अरे वा, आरवला शाबास सांग! माझं गुडघं थोडं दुखतंय",
            "हो हो, पुरणपोळी आण, आणि थोडी बाकरवडी पण",
            "ठीक आहे, उद्या बोलू",
            "हो हो, सांग ना, रोहन काय म्हणतोय?",
        ],
    },
    "appa_checkin": {
        "lang": "ta", "gender": "male",
        "lines": [
            "நான் நன்றாக இருக்கிறேன், மாத்திரை சாப்பிட்டேன்",
            "இன்று என் இரத்த அழுத்தம் நூற்று ஐம்பது க்கு தொண்ணூற்று ஐந்து",
            "ஆமாம், சரிதான்",
            "நான் இன்று காலை குளியலறையில் விழுந்துவிட்டேன்",
        ],
    },
    "dadi_inbound": {
        "lang": "hi", "gender": "female",
        "lines": ["मेरी दवाई आज कब लेनी है?", "ठीक है, धन्यवाद बेटा"],
    },
}


async def synth(lang: str, gender: str, text: str, out: Path) -> float:
    voice = get_language(lang).voice(gender)
    raw = bytearray()
    # Sneha speaks in the language's normal female voice. The parents must never sound like her, so they are older: a lower
    # pitch and a slower pace for the women (same base voice), and the male voice for the men.
    shift = {"pitch": "-22Hz", "rate": "-14%"} if gender == "female" else {"pitch": "-6Hz", "rate": "-10%"}
    async for c in edge_tts.Communicate(text, voice, **shift).stream():
        if c["type"] == "audio":
            raw.extend(c["data"])
    d = miniaudio.decode(bytes(raw), output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1, sample_rate=RATE)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(d.samples.tobytes())
    return len(d.samples) / RATE


async def main() -> None:
    AUDIO.mkdir(exist_ok=True)
    s = get_settings()
    print("resetting the demo workspace...")
    result = await asyncio.to_thread(seed, s)
    from supabase import create_client

    db = create_client(s.supabase_url, s.supabase_service_role_key)
    parents = {}
    for key, pid in result["parent_ids"].items():
        row = db.table("parents").select("proof_token").eq("id", pid).single().execute().data
        parents[key] = {"id": pid, "proof_token": row["proof_token"]}
    files: dict[str, list[dict]] = {}
    for name, cfg in LINES.items():
        files[name] = []
        for i, text in enumerate(cfg["lines"]):
            out = AUDIO / f"{name}_{i}.wav"
            secs = await synth(cfg["lang"], cfg["gender"], text, out)
            files[name].append({"file": out.name, "text": text, "seconds": round(secs, 1)})
            print(f"  {out.name}: {secs:.1f}s  {text}")
    (HERE / "state.json").write_text(json.dumps({"family_id": result["family_id"], "parents": parents, "audio": files}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("state.json written")


if __name__ == "__main__":
    asyncio.run(main())
