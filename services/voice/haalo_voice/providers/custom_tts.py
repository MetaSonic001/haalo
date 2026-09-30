"""Custom Pipecat TTS services for providers Pipecat does not ship: Edge (DEV_ONLY), Bhashini, indic_local."""

from __future__ import annotations

import asyncio
import base64
import queue
import threading
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass

import aiohttp
import miniaudio
from loguru import logger
from pipecat.frames.frames import ErrorFrame, Frame
from pipecat.services.settings import TTSSettings
from pipecat.services.tts_service import TTSService
from pipecat.utils.tracing.service_decorators import traced_tts


@dataclass
class _Settings(TTSSettings):
    pass


class _OneShotTTS(TTSService):
    """Base for providers that return a whole utterance per request (we synthesise per sentence)."""

    Settings = _Settings
    _settings: Settings

    def __init__(self, *, voice: str, language: str, sample_rate: int | None = None, **kwargs):
        super().__init__(
            pause_frame_processing=True,
            push_start_frame=True,
            push_stop_frames=True,
            sample_rate=sample_rate,
            settings=_Settings(model=None, voice=voice, language=language),
            **kwargs,
        )

    def can_generate_metrics(self) -> bool:
        return True

    async def synth(self, text: str) -> tuple[bytes, int]:
        """Return (pcm16 mono bytes, sample_rate)."""
        raise NotImplementedError

    async def synth_stream(self, text: str) -> tuple[int, AsyncIterator[bytes]]:
        """Return (sample_rate, async iterator of PCM chunks). Default: the whole utterance as one chunk.
        Providers that can stream override this so audio starts before synthesis finishes."""
        pcm, rate = await self.synth(text)

        async def one() -> AsyncIterator[bytes]:
            yield pcm

        return rate, one()

    @traced_tts
    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        try:
            await self.start_tts_usage_metrics(text)
            rate, chunks = await self.synth_stream(text)
            self._fails = 0
            async for frame in self._stream_audio_frames_from_iterator(chunks, in_sample_rate=rate, context_id=context_id):
                await self.stop_ttfb_metrics()
                yield frame
        except Exception as e:  # surfaced to the failover switcher
            logger.error(f"{self.__class__.__name__} failed: {e}")
            self._fails = getattr(self, "_fails", 0) + 1
            if self._fails >= 2:  # two in a row: hand over to the fallback provider (ServiceSwitcherStrategyFailover)
                await self.set_usable(False)
            yield ErrorFrame(error=f"{self.__class__.__name__}: {e}")
        finally:
            await self.stop_ttfb_metrics()


def decode_to_pcm(data: bytes, rate: int = 24000) -> tuple[bytes, int]:
    """Decode mp3/wav/ogg bytes to mono int16 PCM."""
    decoded = miniaudio.decode(
        data, output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1, sample_rate=rate
    )
    return decoded.samples.tobytes(), rate


class _ChunkSource(miniaudio.StreamableSource):
    """Blocking byte source fed from another thread: lets miniaudio decode MP3 while it is still arriving."""

    def __init__(self) -> None:
        self.q: queue.Queue[bytes | None] = queue.Queue()
        self._buf = b""

    def read(self, num_bytes: int) -> bytes:
        while not self._buf:
            item = self.q.get()
            if item is None:
                return b""  # EOF
            self._buf = item
        out, self._buf = self._buf[:num_bytes], self._buf[num_bytes:]
        return out


class EdgeTTSService(_OneShotTTS):
    """Microsoft Edge read-aloud voices. UNOFFICIAL endpoint: DEV_ONLY, blocked in production by config."""

    def __init__(self, *, voice: str, language: str, pace: float = 0.9, **kwargs):
        super().__init__(voice=voice, language=language, **kwargs)
        pct = round((pace - 1.0) * 100)
        self._rate = f"{pct:+d}%"

    async def synth(self, text: str) -> tuple[bytes, int]:
        import edge_tts  # local import: dev-only dependency path

        comm = edge_tts.Communicate(text, self._settings.voice, rate=self._rate)
        chunks = bytearray()
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                chunks.extend(chunk["data"])
        if not chunks:
            raise RuntimeError("edge-tts returned no audio")
        return decode_to_pcm(bytes(chunks))

    async def synth_stream(self, text: str) -> tuple[int, AsyncIterator[bytes]]:
        """Stream: Edge yields MP3 chunks as they are produced; a decoder thread turns them into PCM immediately.
        First audio arrives after the first chunk, not after the whole sentence."""
        import edge_tts

        rate = 24000
        loop = asyncio.get_running_loop()
        src = _ChunkSource()
        pcm_q: asyncio.Queue[bytes | None] = asyncio.Queue()

        def decode() -> None:
            try:
                for arr in miniaudio.stream_any(
                    src, source_format=miniaudio.FileFormat.MP3, output_format=miniaudio.SampleFormat.SIGNED16,
                    nchannels=1, sample_rate=rate, frames_to_read=1200,
                ):
                    loop.call_soon_threadsafe(pcm_q.put_nowait, arr.tobytes())
            except Exception as e:  # noqa: BLE001 - decoder ends the stream; the network side reports real failures
                logger.debug(f"edge decode ended: {e}")
            finally:
                loop.call_soon_threadsafe(pcm_q.put_nowait, None)

        threading.Thread(target=decode, daemon=True).start()

        async def feed() -> None:
            got = False
            try:
                async for chunk in edge_tts.Communicate(text, self._settings.voice, rate=self._rate).stream():
                    if chunk["type"] == "audio":
                        got = True
                        src.q.put(chunk["data"])
            finally:
                src.q.put(None)
            if not got:
                raise RuntimeError("edge-tts returned no audio")

        feeder = asyncio.create_task(feed())

        async def out() -> AsyncIterator[bytes]:
            while (item := await pcm_q.get()) is not None:
                yield item
            await feeder  # surface network errors to the failover logic

        return rate, out()


class IndicLocalTTSService(_OneShotTTS):
    """Self-hosted OSS TTS (AI4Bharat Indic-TTS / svara-TTS) behind our own small HTTP server.

    Contract (implemented by the optional GPU/CPU box): POST {url}/tts
      {"text": str, "language": "mr", "voice": str, "pace": float} -> audio/wav body.
    """

    def __init__(self, *, url: str, voice: str, language: str, pace: float = 0.9, **kwargs):
        super().__init__(voice=voice, language=language, **kwargs)
        self._url = url.rstrip("/")
        self._pace = pace

    async def synth(self, text: str) -> tuple[bytes, int]:
        payload = {
            "text": text,
            "language": self._settings.language,
            "voice": self._settings.voice,
            "pace": self._pace,
        }
        async with aiohttp.ClientSession() as s:
            async with s.post(f"{self._url}/tts", json=payload, timeout=aiohttp.ClientTimeout(total=20)) as r:
                r.raise_for_status()
                data = await r.read()
        return decode_to_pcm(data)


class BhashiniTTSService(_OneShotTTS):
    """Bhashini (Digital India) TTS via the ULCA pipeline API. Best-effort, no SLA.

    Flow verified from public docs/clients: config call (getModelsPipeline) -> callbackUrl + serviceId,
    then compute call. Requires BHASHINI_USER_ID / BHASHINI_API_KEY / BHASHINI_PIPELINE_ID.
    """

    def __init__(self, *, client, voice: str, language: str, gender: str = "female", **kwargs):
        super().__init__(voice=voice, language=language, **kwargs)
        self._client = client
        self._gender = gender

    async def synth(self, text: str) -> tuple[bytes, int]:
        audio_b64 = await self._client.tts(text, self._settings.language, self._gender)
        return decode_to_pcm(base64.b64decode(audio_b64))
