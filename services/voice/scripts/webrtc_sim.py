"""Simulate a parent on a real WebRTC call against the running voice service (needs the service + Groq key).

    uv run python scripts/webrtc_sim.py --lang mr --say "छान आहे रे|मी बीपीची गोळी घेतली" [--parent <uuid>] [--out out.wav]

The parent's lines are synthesised speech (Edge TTS, dev only), played in real time with realistic pauses. The script waits for
the agent to finish speaking before each line, records the agent audio, and prints latency (end of our speech -> first agent audio).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import wave
from fractions import Fraction

import av
import edge_tts
import httpx
import miniaudio
import numpy as np
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription

from haalo_voice.languages import get_language

RATE = 48000
FRAME = 960  # 20 ms


class ParentTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self) -> None:
        super().__init__()
        self.queue: asyncio.Queue[bytes] = asyncio.Queue()
        self.buf = b""
        self.t0: float | None = None
        self.n = 0
        self.speaking_until = 0.0

    def say(self, pcm: bytes) -> None:
        self.queue.put_nowait(pcm)

    @property
    def speaking(self) -> bool:
        return bool(self.buf) or not self.queue.empty()

    async def recv(self) -> av.AudioFrame:
        if self.t0 is None:
            self.t0 = time.perf_counter()
        # real-time pacing
        due = self.t0 + self.n * FRAME / RATE
        await asyncio.sleep(max(0, due - time.perf_counter()))
        need = FRAME * 2
        if len(self.buf) < need and not self.queue.empty():
            self.buf += self.queue.get_nowait()
        chunk, self.buf = self.buf[:need], self.buf[need:]
        chunk = chunk.ljust(need, b"\x00")
        frame = av.AudioFrame(format="s16", layout="mono", samples=FRAME)
        frame.planes[0].update(chunk)
        frame.sample_rate = RATE
        frame.pts = self.n * FRAME
        frame.time_base = Fraction(1, RATE)
        self.n += 1
        return frame


async def synth(lang_code: str, text: str, gender: str = "male") -> bytes:
    lang = get_language(lang_code)
    voice = lang.voice(gender) or lang.voice("female")
    chunks = bytearray()
    async for c in edge_tts.Communicate(text, voice).stream():
        if c["type"] == "audio":
            chunks.extend(c["data"])
    d = miniaudio.decode(bytes(chunks), output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1, sample_rate=RATE)
    return d.samples.tobytes()


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:7860")
    ap.add_argument("--lang", default="mr")
    ap.add_argument("--say", required=True, help="parent lines separated by |")
    ap.add_argument("--parent", default=None, help="dev_parent_id: talk as a real parent profile from the DB")
    ap.add_argument("--mode", default="checkin", choices=["checkin", "reminder", "inbound"])
    ap.add_argument("--out", default="evals/out/agent.wav")
    ap.add_argument("--max-wait", type=float, default=60)
    a = ap.parse_args()
    lines = [x.strip() for x in a.say.split("|") if x.strip()]
    print(f"synthesising {len(lines)} parent lines ({a.lang})...")
    pcm_lines = [await synth(a.lang, t) for t in lines]

    pc = RTCPeerConnection()
    track = ParentTrack()
    pc.addTrack(track)
    agent_pcm = bytearray()
    state = {"last_voice": 0.0, "agent_started": False, "voiced_frames": 0, "spoke_at": None, "latencies": []}

    @pc.on("track")
    def on_track(rt: MediaStreamTrack) -> None:
        async def pump() -> None:
            while True:
                try:
                    f = await rt.recv()
                except Exception:
                    return
                arr = f.to_ndarray().astype(np.int16).flatten()
                agent_pcm.extend(arr.tobytes())
                if float(np.abs(arr).mean()) > 250:
                    now = time.perf_counter()
                    if state["spoke_at"] is not None:
                        state["latencies"].append((now - state["spoke_at"]) * 1000)
                        state["spoke_at"] = None
                    state["last_voice"] = now
                    state["agent_started"] = True

        asyncio.create_task(pump())

    await pc.setLocalDescription(await pc.createOffer())
    while pc.iceGatheringState != "complete":
        await asyncio.sleep(0.1)
    body = {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type, "language": a.lang}
    body["mode"] = a.mode
    if a.parent:
        body["dev_parent_id"] = a.parent
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{a.url}/webrtc/offer", json=body)
    if r.status_code != 200:
        raise SystemExit(f"offer failed {r.status_code}: {r.text[:300]}")
    ans = r.json()
    await pc.setRemoteDescription(RTCSessionDescription(sdp=ans["sdp"], type=ans["type"]))
    print("connected; waiting for the agent's opening line...")

    async def agent_quiet(min_quiet: float = 2.0, timeout: float = a.max_wait) -> bool:
        t_end = time.perf_counter() + timeout
        while time.perf_counter() < t_end:
            if state["agent_started"] and time.perf_counter() - state["last_voice"] > min_quiet:
                return True
            await asyncio.sleep(0.1)
        return False

    ok = await agent_quiet()
    print(f"agent opening line finished: {ok}  ({len(agent_pcm) / 2 / RATE:.1f}s of audio so far)")
    for i, (text, pcm) in enumerate(zip(lines, pcm_lines, strict=True)):
        print(f"parent[{i}]: {text}")
        track.say(pcm)
        # start the latency clock when our speech ends
        await asyncio.sleep(len(pcm) / 2 / RATE)
        state["spoke_at"] = time.perf_counter()
        state["agent_started"] = False  # only a reply that begins after we finished speaking counts
        await asyncio.sleep(1.5)
        if not await agent_quiet(min_quiet=3.0):
            print("  (agent did not respond in time)")
    await asyncio.sleep(1.0)
    await pc.close()

    with wave.open(a.out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(agent_pcm))
    await asyncio.sleep(4)  # let the server finish and persist the call
    try:
        from supabase import create_client

        from haalo_voice.config import get_settings

        st = get_settings()
        db = create_client(st.supabase_url, st.supabase_service_role_key)
        q = db.table("calls").select("id")
        q = q.eq("parent_id", a.parent) if a.parent else q.eq("demo", True)
        call = q.order("created_at", desc=True).limit(1).execute().data
        if call:
            for t in db.table("call_turns").select("speaker,text").eq("call_id", call[0]["id"]).order("id").execute().data:
                print(f"  [{t['speaker']:6}] {t['text']}")
    except Exception as e:  # noqa: BLE001
        print("  (transcript unavailable:", e, ")")
    lat = sorted(state["latencies"])
    print(json.dumps({"agent_audio_s": round(len(agent_pcm) / 2 / RATE, 1), "responses": len(lat), "latency_ms": [round(x) for x in lat], "out": a.out}))


if __name__ == "__main__":
    asyncio.run(main())
