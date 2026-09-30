"""Bhashini ULCA pipeline client + STT adapter. Best-effort (government service, no SLA)."""

from __future__ import annotations

import base64
import io
import time
import wave
from collections.abc import AsyncGenerator

import aiohttp
from pipecat.frames.frames import ErrorFrame, Frame, TranscriptionFrame
from pipecat.services.settings import STTSettings
from pipecat.services.stt_service import SegmentedSTTService
from pipecat.utils.time import time_now_iso8601

CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"


class BhashiniClient:
    def __init__(self, user_id: str, api_key: str, pipeline_id: str):
        if not (user_id and api_key and pipeline_id):
            raise ValueError("BHASHINI_USER_ID, BHASHINI_API_KEY and BHASHINI_PIPELINE_ID are required")
        self._user_id, self._api_key, self._pipeline_id = user_id, api_key, pipeline_id
        self._cache: dict[tuple[str, str], tuple[str, str, str, str]] = {}

    async def _config(self, task: str, lang: str) -> tuple[str, str, str, str]:
        key = (task, lang)
        if key in self._cache:
            return self._cache[key]
        body = {
            "pipelineTasks": [{"taskType": task, "config": {"language": {"sourceLanguage": lang}}}],
            "pipelineRequestConfig": {"pipelineId": self._pipeline_id},
        }
        headers = {"userID": self._user_id, "ulcaApiKey": self._api_key}
        async with aiohttp.ClientSession() as s:
            async with s.post(CONFIG_URL, json=body, headers=headers) as r:
                r.raise_for_status()
                d = await r.json()
        ep = d["pipelineInferenceAPIEndPoint"]
        service_id = d["pipelineResponseConfig"][0]["config"][0]["serviceId"]
        auth = ep["inferenceApiKey"]
        out = (ep["callbackUrl"], service_id, auth["name"], auth["value"])
        self._cache[key] = out
        return out

    async def _compute(self, task: str, lang: str, config_extra: dict, input_data: dict) -> dict:
        url, service_id, hname, hval = await self._config(task, lang)
        body = {
            "pipelineTasks": [
                {
                    "taskType": task,
                    "config": {"language": {"sourceLanguage": lang}, "serviceId": service_id, **config_extra},
                }
            ],
            "inputData": input_data,
        }
        async with aiohttp.ClientSession() as s:
            async with s.post(url, json=body, headers={hname: hval}, timeout=aiohttp.ClientTimeout(total=15)) as r:
                r.raise_for_status()
                return await r.json()

    async def asr(self, wav_bytes: bytes, lang: str, sample_rate: int) -> str:
        d = await self._compute(
            "asr",
            lang,
            {"audioFormat": "wav", "samplingRate": sample_rate},
            {"audio": [{"audioContent": base64.b64encode(wav_bytes).decode()}]},
        )
        return d["pipelineResponse"][0]["output"][0]["source"]

    async def tts(self, text: str, lang: str, gender: str) -> str:
        d = await self._compute(
            "tts", lang, {"gender": gender, "samplingRate": 24000}, {"input": [{"source": text}]}
        )
        return d["pipelineResponse"][0]["audio"][0]["audioContent"]


class BhashiniSTTService(SegmentedSTTService):
    def __init__(self, *, client: BhashiniClient, language: str, **kwargs):
        super().__init__(settings=STTSettings(model=None, language=language), **kwargs)
        self._client = client
        self._lang = language

    def can_generate_metrics(self) -> bool:
        return True

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        # `audio` is raw PCM16 at self.sample_rate; wrap as WAV for the API.
        try:
            await self.start_processing_metrics()
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(self.sample_rate)
                w.writeframes(audio)
            text = (await self._client.asr(buf.getvalue(), self._lang, self.sample_rate)).strip()
            await self.stop_processing_metrics()
            self._fails = 0
            if text:
                yield TranscriptionFrame(text, self._user_id, time_now_iso8601())
        except Exception as e:
            self._fails = getattr(self, "_fails", 0) + 1
            if self._fails >= 2:
                await self.set_usable(False)  # fail over to the fallback STT provider
            yield ErrorFrame(error=f"BhashiniSTT: {e}")


class IndicLocalSTTService(SegmentedSTTService):
    """Self-hosted AI4Bharat IndicConformer behind our small HTTP server.

    Contract: POST {url}/stt  multipart/form-data: file=<wav>, language=<code> -> {"text": "..."}.
    """

    def __init__(self, *, url: str, language: str, **kwargs):
        super().__init__(settings=STTSettings(model=None, language=language), **kwargs)
        self._url = url.rstrip("/")
        self._lang = language

    def can_generate_metrics(self) -> bool:
        return True

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        try:
            await self.start_processing_metrics()
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(self.sample_rate)
                w.writeframes(audio)
            form = aiohttp.FormData()
            form.add_field("file", buf.getvalue(), filename="audio.wav", content_type="audio/wav")
            form.add_field("language", self._lang)
            async with aiohttp.ClientSession() as s:
                async with s.post(f"{self._url}/stt", data=form, timeout=aiohttp.ClientTimeout(total=20)) as r:
                    r.raise_for_status()
                    text = ((await r.json()).get("text") or "").strip()
            await self.stop_processing_metrics()
            self._fails = 0
            if text:
                yield TranscriptionFrame(text, self._user_id, time_now_iso8601())
        except Exception as e:
            self._fails = getattr(self, "_fails", 0) + 1
            if self._fails >= 2:
                await self.set_usable(False)  # fail over to the fallback STT provider
            yield ErrorFrame(error=f"IndicLocalSTT: {e}")


__all__ = ["BhashiniClient", "BhashiniSTTService", "IndicLocalSTTService", "time"]
