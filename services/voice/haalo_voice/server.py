"""FastAPI app: health/metrics, WebRTC demo, telephony webhooks + media socket, internal dial."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
)
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

from . import insights as insights_mod
from . import proofs as proofs_mod
from .bot import run_call
from .config import get_settings, validate_startup
from .escalation import Escalator
from .languages import get_language, load_registry
from .llm import validate_models
from .logging_setup import setup_logging
from .postcall import run_post_call
from .reminders import CareEngine
from .samples import sample_audio
from .scheduler import Scheduler
from .session import FEEDS, PENDING, CallSession, demo_profile
from .store import build_store
from .telephony import CallOutcome, build_telephony

S = get_settings()
setup_logging(S.log_level, json=S.is_production)
METRICS: dict[str, float] = defaultdict(float)
CONNS: dict[str, object] = {}
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
    app.state.escalator = Escalator(S, app.state.store, app.state.tel)
    app.state.care = CareEngine(S, app.state.store, app.state.escalator)
    app.state.scheduler = Scheduler(S, app.state.store, app.state.tel, app.state.care, app.state.escalator)
    if S.scheduler_enabled and S.supabase_url:
        app.state.scheduler.start()  # without a calling number it still prepares dose events and appointment notices
        asyncio.create_task(app.state.escalator.resume())
    yield
    await app.state.scheduler.stop()
    await app.state.webrtc.close()


app = FastAPI(title="Sneha voice", lifespan=lifespan)
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
    dev_parent_id: str | None = None  # dev, or the demo workspace's sandbox parents: talk as that parent profile
    mode: str = "checkin"  # checkin | reminder | inbound


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

    store = app.state.store
    profile = None
    mode = body.mode if body.mode in ("checkin", "reminder", "inbound") else "checkin"
    dose_ids: list[str] = []
    if not body.pc_id:
        if body.dev_parent_id:
            profile = await store.load_parent(body.dev_parent_id)
            if profile is None and S.is_production:
                raise HTTPException(404, "parent not found")
            if profile is not None and S.is_production and not (S.demo_workspace and profile.sandbox):
                raise HTTPException(403, "only sandbox parents can be called from the browser")
            profile = profile or demo_profile(body.language, body.honorific)
        else:
            profile = demo_profile(body.language, body.honorific)
        if mode == "reminder" and not profile.is_demo:
            dose_ids = await store.open_doses_for_reminder(profile.parent_id, profile.timezone)
            if not dose_ids:
                raise HTTPException(409, "No dose is due right now. Use 'Make a dose due' first.")
        elif mode == "reminder":
            dose_ids = [d.event_id for d in profile.doses_today]

    call_id = str(uuid.uuid4())

    async def on_connection(conn):
        CONNS[conn.pc_id] = conn
        demo = profile.is_demo
        session = CallSession(
            call_id=call_id, profile=profile, provider="webrtc", purpose=mode, direction="inbound" if mode == "inbound" else "outbound", dose_event_ids=dose_ids
        )
        transport = SmallWebRTCTransport(
            webrtc_connection=conn,
            params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        )
        await store.create_call(session, status="in_progress")
        METRICS["webrtc_sessions"] += 1
        asyncio.create_task(
            run_call(
                transport, session, S, store, telephony=False, on_finished=_finish_hook(app), escalator=app.state.escalator,
                max_seconds=S.demo_max_seconds if demo else (300 if profile.sandbox else None),
            )
        )

    req = SmallWebRTCRequest(sdp=body.sdp, type=body.type, pc_id=body.pc_id, restart_pc=body.restart_pc)
    answer = await app.state.webrtc.handle_web_request(req, on_connection)
    if isinstance(answer, dict) and not body.pc_id:
        answer = {**answer, "call_id": call_id}
    return answer


class EndBody(BaseModel):
    pc_id: str


@app.post("/webrtc/end")
async def webrtc_end(body: EndBody):
    """The caller hung up. Browsers do not reliably tell the server when a peer connection closes (it can take half a minute to notice),
    so the page says so explicitly and the call is finished at once: summary, doses and the family's notification follow immediately."""
    conn = CONNS.pop(body.pc_id, None)
    if conn is not None:
        await conn.disconnect()
    return {"ok": True}


@app.get("/live/{call_id}")
async def live_feed(call_id: str, after: int = 0):
    """Transcript and actions of a browser demo call, for the live panel. Only demo-persona and demo-workspace calls ever have a feed."""
    feed = FEEDS.get(call_id)
    if feed is None:
        return {"items": [], "done": False, "next": after}
    items = feed.items[after:]
    return {"items": items, "done": feed.done, "next": after + len(items)}


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


# ------------------------------------------------------------------ care features (called by the web app after it checks access)
class ParentBody(BaseModel):
    parent_id: str


class EscalateBody(BaseModel):
    parent_id: str
    trigger: str = "manual_test"
    summary: str = ""


class AckBody(BaseModel):
    by: str = "family"


async def _sandbox_only(parent_id: str):
    profile = await app.state.store.load_parent(parent_id)
    if profile is None:
        raise HTTPException(404, "parent not found")
    if not profile.sandbox:
        raise HTTPException(403, "only demo-workspace parents can be driven this way")
    return profile


@app.post("/care/escalate", dependencies=[Depends(_service_auth)])
async def care_escalate(body: EscalateBody):
    if body.trigger not in ("emergency", "missed_calls", "missed_dose", "parent_request", "manual_test"):
        raise HTTPException(400, "unknown trigger")
    profile = await app.state.store.load_parent(body.parent_id)
    if profile is None:
        raise HTTPException(404, "parent not found")
    who = profile.honorific or profile.name
    summary = body.summary or f"This is a test of the alert ladder for {who}. Nothing is wrong."
    esc_id = await app.state.escalator.start(body.parent_id, body.trigger, summary)
    return {"ok": True, "escalation_id": esc_id}


@app.post("/care/escalations/{esc_id}/ack", dependencies=[Depends(_service_auth)])
async def care_ack(esc_id: str, body: AckBody):
    await app.state.escalator.acknowledge(esc_id, body.by)
    return {"ok": True}


@app.post("/care/reminder-call", dependencies=[Depends(_service_auth)])
async def care_reminder_call(body: ParentBody):
    """'Remind now': a reminder call about the doses that are due and unconfirmed (real telephony; sandbox parents use the browser)."""
    store = app.state.store
    profile = await store.load_parent(body.parent_id)
    if profile is None:
        raise HTTPException(404, "parent not found")
    if profile.sandbox:
        raise HTTPException(409, "demo parents are called from the browser")
    ids = await store.open_doses_for_reminder(body.parent_id, profile.timezone)
    if not ids:
        raise HTTPException(409, "No dose is due or unconfirmed right now.")
    call_id = await store.create_reminder_call(body.parent_id, ids)
    await app.state.scheduler._dial({"id": call_id, "parent_id": body.parent_id, "purpose": "reminder"})
    return {"ok": True, "call_id": call_id}


@app.post("/care/demo/due-dose", dependencies=[Depends(_service_auth)])
async def care_demo_due_dose(body: ParentBody):
    await _sandbox_only(body.parent_id)
    made = await app.state.store.make_dose_due(body.parent_id)
    if not made:
        raise HTTPException(409, "This parent has no active medicines.")
    return {"ok": True, **made}


@app.post("/care/demo/reset", dependencies=[Depends(_service_auth)])
async def care_demo_reset():
    if not S.demo_workspace:
        raise HTTPException(403, "demo workspace is not enabled (DEMO_WORKSPACE=true)")
    from .demo_seed import seed

    result = await asyncio.to_thread(seed, S)
    return {"ok": True, **result}


@app.post("/care/insights/run", dependencies=[Depends(_service_auth)])
async def care_insights(body: ParentBody):
    from datetime import date

    found = await insights_mod.compute_for_parent(S, app.state.store, body.parent_id, date.today())
    return {"ok": True, "insights": [{"kind": i.kind, "severity": i.severity, "title": i.title} for i in found]}


@app.get("/care/calendar", dependencies=[Depends(_service_auth)])
async def care_calendar(parent_id: str):
    """Upcoming festivals for the parent's chosen tradition, plus the birthday, for the family calendar."""
    from datetime import date, timedelta

    from .festivals import upcoming

    profile = await app.state.store.parent_brief(parent_id)
    if profile is None:
        raise HTTPException(404, "parent not found")
    today = date.today()
    found = [{"date": d.isoformat(), "name": n} for d, n in upcoming(today, language=profile["language"], tradition=profile.get("tradition") or "", within_days=75)]
    if profile.get("birthday"):
        b = date.fromisoformat(profile["birthday"])
        nxt = b.replace(year=today.year)
        if nxt < today:
            nxt = nxt.replace(year=today.year + 1)
        if nxt <= today + timedelta(days=75):
            found.append({"date": nxt.isoformat(), "name": f"{profile.get('honorific') or profile['name']}'s birthday"})
    return {"occasions": sorted(found, key=lambda x: x["date"])}


@app.post("/care/proofs", dependencies=[Depends(_service_auth)])
async def care_proofs(
    parent_id: str = Form(...),
    file: UploadFile = File(...),  # noqa: B008
    uploaded_by: str = Form("parent_link"),
):
    mime = (file.content_type or "").lower()
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "Please send a JPEG, PNG or WebP photo.")
    data = await file.read()
    if len(data) > S.proof_max_bytes:
        raise HTTPException(413, "That photo is too large.")
    try:
        return {"ok": True, **await proofs_mod.handle_photo(S, app.state.store, parent_id, data, mime, uploaded_by=uploaded_by)}
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except httpx.HTTPError as e:
        logger.warning(f"vision call failed: {e}")
        raise HTTPException(503, "Sneha couldn't read that photo right now. Please try again in a moment.") from e


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
    session = CallSession(profile=profile, direction="inbound", provider=tel.name, provider_call_id=form.get("CallSid"), purpose="inbound")
    PENDING[session.call_id] = session
    await app.state.store.create_call(session, status="in_progress")
    body, mt = tel.answer_document(media_ws_url=ws, params={"call_id": session.call_id, "from_number": caller})
    return Response(body, media_type=mt)


@app.post("/telephony/ack")
async def telephony_ack(request: Request, esc: str = "", contact: str = ""):
    """A contact pressed a key on an escalation alert call: pressing 1 means 'I am on it' and stops the ladder."""
    form = dict((await request.form()).items())
    tel = app.state.tel
    if not tel or not tel.verify_webhook(url=_public_url(request), form=form, signature=request.headers.get("X-Twilio-Signature", "")):
        raise HTTPException(403, "invalid signature")
    if form.get("Digits") == "1" and esc:
        await app.state.escalator.acknowledge(esc, f"contact:{contact}")
        say = "Thank you. Sneha has marked this as handled."
    else:
        say = "Goodbye."
    return Response(f'<?xml version="1.0"?><Response><Say>{say}</Say></Response>', media_type="application/xml")


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
        await app.state.scheduler.handle_no_answer(call_id, int(row.get("attempt", 1)), row["parent_id"], row.get("purpose") or "checkin")
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
    await run_call(transport, session, S, app.state.store, telephony=True, on_finished=_finish_hook(app), escalator=app.state.escalator)


for _path in ("/telephony/ws", "/telephony/twilio", "/telephony/exotel", "/telephony/plivo"):
    app.websocket(_path)(_media_socket)


def run() -> None:
    import uvicorn

    uvicorn.run("haalo_voice.server:app", host=S.host, port=S.port, log_level=S.log_level.lower())


__all__ = ["app", "get_language", "run"]
