"""Run a short simulated call in each language and check the agent answered in the right script.

    uv run python scripts/lang_sweep.py [--langs mr,hi,en,gu,ta,te,kn,bn,ml]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

from evals.metrics import script_ratio
from haalo_voice.languages import get_language, load_registry

UTT = json.loads((Path(__file__).parent.parent / "evals" / "utterances.json").read_text(encoding="utf-8"))


async def one(code: str) -> dict:
    lines = "|".join(u["text"] for u in UTT[code][:2])
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "scripts/webrtc_sim.py", "--lang", code, "--say", lines, "--out", f"evals/out/agent_{code}.wav",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    out = (await proc.communicate())[0].decode("utf-8", "replace")
    agent = [ln.split("]", 1)[1].strip() for ln in out.splitlines() if ln.strip().startswith("[agent")]
    parent = [ln.split("]", 1)[1].strip() for ln in out.splitlines() if ln.strip().startswith("[parent")]
    script = get_language(code).script
    ratios = [script_ratio(t, script) for t in agent]
    stats = next((json.loads(ln) for ln in out.splitlines() if ln.startswith("{")), {})
    return {"lang": code, "agent_turns": len(agent), "script_ok": bool(ratios) and min(ratios) >= 0.6, "ratios": [round(r, 2) for r in ratios],
            "latency_ms": stats.get("latency_ms"), "parent_heard": parent, "agent": agent}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default="mr,hi,en,gu,ta,te,kn,bn,ml")
    a = ap.parse_args()
    for code in a.langs.split(","):
        assert code in load_registry(), code
        r = await one(code)
        print(f"\n=== {code} {get_language(code).native_name}: agent turns={r['agent_turns']} script_ok={r['script_ok']} ratios={r['ratios']} latency={r['latency_ms']}")
        for i, t in enumerate(r["agent"]):
            print(f"   agent[{i}]: {t}")
        for t in r["parent_heard"]:
            print(f"   HEARD (what Whisper transcribed): {t}")


if __name__ == "__main__":
    asyncio.run(main())
