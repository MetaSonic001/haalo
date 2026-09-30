# Haalo voice service

Pipecat cascade: `Transport -> Silero VAD -> STT -> safety -> context -> Groq LLM (streaming) -> TTS -> Transport`.
Transports: SmallWebRTC (browser demo / dev) and Twilio Media Streams (phone). Exotel/Plivo plug into the same `TelephonyProvider` interface.

```bash
uv sync
uv run haalo-models          # list valid Groq model ids for your key
uv run haalo-voice           # http://localhost:7860  (/health, /metrics, /languages, /tts/sample)
uv run pytest                # unit + full pipeline wiring tests (no keys needed)
```

## Providers (all chosen in `.env`)

| Kind | Provider | Notes |
| --- | --- | --- |
| STT | `groq_whisper` | Free tier. Default. Family vocab is passed as the Whisper prompt |
| STT | `sarvam` | Best Indic quality; paid after free credits |
| STT | `bhashini` | Free, government, best effort (no SLA). Needs `BHASHINI_*` |
| STT | `indic_local` | Your own box running AI4Bharat IndicConformer. Contract: `POST {INDIC_LOCAL_URL}/stt` |
| TTS | `edge` | DEV_ONLY. Free, many Indian voices, unofficial endpoint |
| TTS | `sarvam` | Bulbul v3, natural Indian voices |
| TTS | `bhashini` | Free, best effort |
| TTS | `indic_local` | Self-hosted Indic-TTS / svara-TTS. Contract: `POST {INDIC_LOCAL_URL}/tts` -> wav. Check each model card's licence before adding a model |
| TTS | `groq_orpheus` | English only |

Per-language override: `TTS_PROVIDER_MR=sarvam`. Fallbacks: `TTS_FALLBACK_PROVIDER=edge`, `STT_FALLBACK_HI=bhashini`.
Failover happens automatically when a provider fails twice in a row.

## Twilio (first telephony provider)

1. Twilio console: copy Account SID and Auth Token, buy/claim a number. Put them in `.env` (`TWILIO_*`).
2. Expose the service: `cloudflared tunnel --url http://localhost:7860`, then set `PUBLIC_VOICE_BASE_URL` to the https URL it prints.
3. Inbound calls: on the number, set "A call comes in" (POST) to `{PUBLIC_VOICE_BASE_URL}/telephony/twilio/voice`.
4. Outbound needs nothing else: calls are placed by REST with inline TwiML pointing the media stream at `/telephony/ws`.

Trial accounts: only Verified Caller IDs can be called (error 21219), the destination country must be enabled under Voice > Geo permissions,
a trial message plays first (the callee presses a key), and calls cap at 10 minutes. Blocked calls fail visibly with the reason and the fix
in `/admin` (call detail) instead of retrying forever.

## Safety

Every parent turn: per-language keyword/regex fast path (works offline), then the `GROQ_MODEL_FAST` classifier. Emergencies get a scripted
calm response in their language, the family is alerted (push), the call is flagged with the evidence quote. The persona prompt
(`prompts/persona.md`, versioned) forbids medical/legal/financial advice and any request for OTP/bank details.

## Evals (`evals/`)

```bash
uv run python -m evals.run_text --lang mr                 # simulated-parent conversations, scored (needs Groq)
uv run python -m evals.run_text --ci                      # all launch languages; exits 1 if the go/no-go bar is missed
uv run python -m evals.stt_bench --lang mr --providers groq_whisper   # WER, clean and 8 kHz phone quality
uv run python -m evals.latency --lang mr                  # per-stage latency
```

Go/no-go bar per language: safety scenarios 100% correctly escalated, summary fields >= 90% accurate. WER targets are set after the first benchmark.
