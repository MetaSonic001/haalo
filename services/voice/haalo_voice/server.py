"""FastAPI app: health/metrics, WebRTC demo, telephony webhooks + media socket, internal dial."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.request_handler import (
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport
from pydantic import BaseModel

from .bot import run_call
from .config import get_settings, validate_startup
from .languages import get_language, load_registry
from .llm import validate_models
from .logging_setup import setup_logging
from .postcall import run_post_call
from .samples import sample_audio
from .scheduler import Scheduler
from .session import PENDING, CallSession, demo_profile
from .store import build_store
from .telephony import CallOutcome, build_telephony

S = get_settings()
setup_logging(S.log_level, json=S.is_production)
METRICS: dict[str, float] = defaultdict(float)
LATENCIES: deque[float] = deque(maxlen=500)
_rate: dict[str, deque[float]] = defaultdict(deque)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_startup(S)
    if S.groq_api_key or S.groq_model_conversation:
        await validate_models(S)  # fails loudly on unknown model ids
    else:
        logger.warning("GROQ_API_KEY not set: the conversation LLM will not work until it is")
    app.state.store = build_store(S)
    try:
        app.state.tel = build_telephony(S)
    except (ValueError, NotImplementedError) as e:
        logger.warning(f"telephony disabled: {e}")
        app.state.tel = None
    app.state.webrtc = SmallWebRTCRequestHandler()
    app.state.scheduler = Scheduler(S, app.state.store, app.state.tel)
    if S.scheduler_enabled and S.supabase_url and app.state.tel:
        app.state.scheduler.start()
    yield
    await app.state.scheduler.stop()
    await app.state.webrtc.close()


app = FastAPI(title="Haalo voice", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=[o.strip() for o in S.cors_origins.split(",")], allow_methods=["*"], allow_headers=["*"]
)


def _finish_hook(app_: FastAPI):
    async def hook(session: CallSession, status: str) -> None:
        METRICS[f"calls_{status}"] += 1
        LATENCIES.extend(session.latencies_ms)
        await run_post_call(session, status, S, app_.state.store, session.profile.family_language)

    return hook


# ------------------------------------------------------------------ health / metrics
@app.get("/health")
async def health():
    return {
        "ok": True,
        "env": S.app_env,
        "telephony": S.telephony_provider if app.state.tel else None,
        "db": bool(S.supabase_url),
        "languages": {c: x.status for c, x in load_registry().items()},
    }


@app.get("/metrics")
async def metrics():
    lat = sorted(LATENCIES)
    lines = [f"haalo_{k} {v}" for k, v in METRICS.items()]
    if lat:
        lines.append(f"haalo_latency_p50_ms {lat[len(lat) // 2]:.0f}")
        lines.append(f"haalo_latency_p95_ms {lat[min(len(lat) - 1, int(len(lat) * 0.95))]:.0f}")
    return Response("\n".join(lines) + "\n", media_type="text/plain")


# ------------------------------------------------------------------ WebRTC demo / dev
def _limited(ip: str, limit: int = 5, window: int = 600) -> bool:
    q, now = _rate[ip], time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


async def _turnstile_ok(token: str | None, ip: str) -> bool:
    if not S.turnstile_secret:
        return not S.is_production  # captcha is mandatory in production
    if not token:
        return False
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": S.turnstile_secret, "response": token, "remoteip": ip},
        )
    return bool(r.json().get("success"))


class OfferBody(BaseModel):
    sdp: str
    type: str
    pc_id: str | None = None
    restart_pc: bool | None = None
    language: str = "mr"
    honorific: str | None = None
    turnstile_token: str | None = None
    dev_parent_id: str | None = None  # dev only: talk as a real parent profile


@app.post("/webrtc/offer")
async def webrtc_offer(body: OfferBody, request: Request):
    ip = request.client.host if request.client else "?"
    if body.language not in load_registry() or load_registry()[body.language].status == "planned":
        raise HTTPException(400, f"language '{body.language}' is not available")
    if not body.pc_id:  # new session, not a renegotiation
        if _limited(ip, limit=50 if not S.is_production else 5):
            raise HTTPException(429, "Too many demo calls. Please try again in a few minutes.")
        if not await _turnstile_ok(body.turnstile_token, ip):
            raise HTTPException(403, "Captcha check failed.")

    async def on_connection(conn):
        store = app.state.store
        if body.dev_parent_id and not S.is_production:
            profile = await store.load_parent(body.dev_parent_id) or demo_profile(body.language, body.honorific)
            demo = profile.is_demo
        else:
            profile, demo = demo_profile(body.language, body.honorific), True
        session = CallSession(profile=profile, provider="webrtc")
        transport = SmallWebRTCTransport(
            webrtc_connection=conn,
            params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        )
        await store.create_call(session, status="in_progress")
        METRICS["webrtc_sessions"] += 1
        asyncio.create_task(
            run_call(
                transport, session, S, store, telephony=False, on_finished=_finish_hook(app),
                max_seconds=S.demo_max_seconds if demo else None,
            )
        )

    req = SmallWebRTCRequest(sdp=body.sdp, type=body.type, pc_id=body.pc_id, restart_pc=body.restart_pc)
    return await app.state.webrtc.handle_web_request(req, on_connection)


class IceBody(BaseModel):
    pc_id: str
    candidates: list[dict]


@app.patch("/webrtc/offer")
async def webrtc_ice(body: IceBody):
    cands = [IceCandidate(candidate=c["candidate"], sdp_mid=c["sdp_mid"], sdp_mline_index=c["sdp_mline_index"]) for c in body.candidates]
    await app.state.webrtc.handle_patch_request(SmallWebRTCPatchRequest(pc_id=body.pc_id, candidates=cands))
    return {"ok": True}


@app.get("/languages")
async def languages():
    return [
        {"code": x.code, "name": x.name, "native_name": x.native_name, "status": x.status}
        for x in load_registry().values()
    ]


@app.get("/tts/sample")
async def tts_sample(request: Request, lang: str = "mr", gender: str = "female"):
    """Greeting sample in the configured TTS voice, for the landing page language list."""
    reg = load_registry()
    if lang not in reg or reg[lang].status == "planned":
        raise HTTPException(400, f"language '{lang}' is not available")
    ip = request.client.host if request.client else "?"
    if _limited(ip, limit=60 if not S.is_production else 20, window=600):
        raise HTTPException(429, "Too many requests")
    try:
        data, media = await sample_audio(S, reg[lang], gender if gender in ("female", "male") else "female")
    except Exception as e:  # noqa: BLE001 - surface a clean 503 to the page, log the detail
        logger.warning(f"sample failed for {lang}: {e}")
        raise HTTPException(503, "Sample unavailable right now") from e
    return Response(data, media_type=media, headers={"Cache-Control": "public, max-age=86400"})


# ------------------------------------------------------------------ internal dial
def _service_auth(x_service_key: str = Header(default="")):
    if not S.internal_service_key or x_service_key != S.internal_service_key:
        raise HTTPException(401, "bad service key")


class DialBody(BaseModel):
    parent_id: str


@app.post("/calls/dial", dependencies=[Depends(_service_auth)])
async def dial(body: DialBody):
    """On-demand ('Call now'): create the call row and dial immediately."""
    store = app.state.store
    profile = await store.load_parent(body.parent_id)
    if not profile:
        raise HTTPException(404, "parent not found")
    session = CallSession(profile=profile, provider=S.telephony_provider)
    await store.create_call(session, status="dialing")
    await app.state.scheduler._dial({"id": session.call_id, "parent_id": body.parent_id})
    return {"ok": True, "call_id": session.call_id}


# ------------------------------------------------------------------ telephony
def _public_url(request: Request) -> str:
    base = S.public_voice_base_url.rstrip("/")
    return f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")


@app.post("/telephony/twilio/voice")
async def twilio_voice(request: Request):
    """Inbound call answer webhook: identify the parent by caller ID, return TwiML that streams to us."""
    form = dict((await request.form()).items())
    tel = app.state.tel
    if not tel or not tel.verify_webhook(url=_public_url(request), form=form, signature=request.headers.get("X-Twilio-Signature", "")):
        raise HTTPException(403, "invalid signature")
    caller = form.get("From", "")
    profile = await app.state.store.find_parent_by_phone(caller)
    base = S.public_voice_base_url.rstrip("/")
    ws = base.replace("https://", "wss://").replace("http://", "ws://") + "/telephony/ws"
    if profile is None:
        logger.warning("inbound call from unknown number")
        return Response('<?xml version="1.0"?><Response><Say>Sorry, this number is not registered.</Say><Hangup/></Response>', media_type="application/xml")
    session = CallSession(profile=profile, direction="inbound", provider=tel.name, provider_call_id=form.get("CallSid"))
    PENDING[session.call_id] = session
    await app.state.store.create_call(session, status="in_progress")
    body, mt = tel.answer_document(media_ws_url=ws, params={"call_id": session.call_id, "from_number": caller})
    return Response(body, media_type=mt)


@app.post("/telephony/twilio/status")
async def twilio_status(request: Request, call_id: str = ""):
    form = dict((await request.form()).items())
    tel = app.state.tel
    if not tel or not tel.verify_webhook(url=_public_url(request), form=form, signature=request.headers.get("X-Twilio-Signature", "")):
        raise HTTPException(403, "invalid signature")
    upd = tel.parse_status(form)
    store = app.state.store
    if not call_id:
        return {"ok": True}
    row = await store.get_call(call_id)
    if upd.outcome == CallOutcome.NO_ANSWER and row:
        await app.state.scheduler.handle_no_answer(call_id, int(row.get("attempt", 1)), row["parent_id"])
    elif upd.outcome == CallOutcome.FAILED:
        await store.update_call(call_id, status="failed", error_code=upd.error_code, block_reason=str(upd.block_reason) if upd.block_reason else None)
    elif upd.outcome == CallOutcome.IN_PROGRESS:
        await store.update_call(call_id, status="in_progress")
    return {"ok": True}


async def _media_socket(ws: WebSocket):
    await ws.accept()
    tel = app.state.tel
    _, call_data = await parse_telephony_websocket(ws)
    call_id = call_data.body.get("call_id") if call_data.body else None
    session = PENDING.pop(call_id, None) if call_id else None
    if session is None:
        logger.error(f"media socket for unknown call_id={call_id}; closing")
        await ws.close()
        return
    session.provider_call_id = call_data.call_id
    serializer = tel.make_serializer(stream_id=call_data.stream_id, provider_call_id=call_data.call_id)
    transport = FastAPIWebsocketTransport(
        websocket=ws,
        params=FastAPIWebsocketParams(audio_in_enabled=True, audio_out_enabled=True, add_wav_header=False, serializer=serializer),
    )
    METRICS["telephony_sessions"] += 1
    await run_call(transport, session, S, app.state.store, telephony=True, on_finished=_finish_hook(app))


for _path in ("/telephony/ws", "/telephony/twilio", "/telephony/exotel", "/telephony/plivo"):
    app.websocket(_path)(_media_socket)


def run() -> None:
    import uvicorn

    uvicorn.run("haalo_voice.server:app", host=S.host, port=S.port, log_level=S.log_level.lower())


__all__ = ["app", "get_language", "run"]
