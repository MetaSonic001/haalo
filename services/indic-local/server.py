"""Self-hosted Indic STT for Haalo (provider `indic_local`). MIT-licensed AI4Bharat IndicConformer, CPU-friendly, no Docker.

    cd services/indic-local
    uv sync
    # the model is gated: accept its terms at https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
    # then put HF_TOKEN=<your read token> in the root .env
    uv run uvicorn server:app --port 8090

Then set in the root .env:  INDIC_LOCAL_URL=http://localhost:8090  and  STT_PROVIDER_MR=indic_local (per language, or DEFAULT_STT_PROVIDER).
Contract: POST /stt  multipart {file: wav, language: "mr"}  ->  {"text": "..."}.
TTS is not served here: the free Indic TTS models (IndicF5, Indic Parler-TTS) need a GPU to be real-time.
"""

from __future__ import annotations

import io
import os
import threading
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
MODEL_ID = os.environ.get("INDIC_STT_MODEL", "ai4bharat/indic-conformer-600m-multilingual")
DECODER = os.environ.get("INDIC_STT_DECODER", "ctc")  # "ctc" (faster) or "rnnt" (more accurate)
LANGS = set("as bn brx doi gu hi kn kok ks mai ml mni mr ne or pa sa sat sd ta te ur".split())

app = FastAPI(title="haalo-indic-local")
_model = None
_lock = threading.Lock()


def model():
    global _model
    with _lock:
        if _model is None:
            from transformers import AutoModel

            _model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True, token=os.environ.get("HF_TOKEN") or None)
    return _model


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID, "loaded": _model is not None, "decoder": DECODER}


@app.post("/stt")
async def stt(file: UploadFile = File(...), language: str = Form(...)):
    if language not in LANGS:
        raise HTTPException(400, f"language '{language}' not supported")
    data, sr = sf.read(io.BytesIO(await file.read()), dtype="float32", always_2d=True)
    wav = torch.from_numpy(np.ascontiguousarray(data.T)).mean(dim=0, keepdim=True)
    if sr != 16000:
        wav = torchaudio.transforms.Resample(orig_freq=sr, new_freq=16000)(wav)
    with torch.inference_mode():
        text = model()(wav, language, DECODER)
    return {"text": (text if isinstance(text, str) else str(text)).strip()}
