# Architecture Context

## Stack (verified 2026-09-30; exact versions live in lockfiles)

| Layer | Technology | Role |
| --- | --- | --- |
| Monorepo | Turborepo 2 + **pnpm 10** (chosen over bun: Expo SDK 54+ supports isolated installs, Turborepo first-class) | Orchestration |
| Web | Next.js 16 (App Router), React 19, Tailwind 4, Motion | Landing, demo, dashboard, admin |
| Mobile | Expo SDK 57, Expo Router, Reanimated, Skia | Family app |
| Data | Supabase hosted (Postgres, Auth, Storage, Realtime, RLS) | System of record |
| Voice | Python 3.12 via uv, Pipecat 1.12, FastAPI, Silero VAD | Agent, scheduler, post-call jobs |
| LLM | Groq (OpenAI-compatible) | Conversation / fast classify / summary |
| STT/TTS | Provider interfaces chosen by env | See `services/voice/README.md` |
| Telephony | `TelephonyProvider` interface: twilio now; exotel/plivo later | PSTN |

## System boundaries

- `apps/web` — Next.js only. Server-route secrets only. Talks to Supabase + voice service HTTP.
- `apps/mobile` — Expo app. Anon key only.
- `packages/ui-tokens` — design tokens (TS) for web (CSS vars) and mobile (RN theme).
- `packages/shared` — zod schemas, types, i18n, and `languages.json` (single source of the language registry; TS and Python both read it).
- `packages/db` — Supabase generated types + typed helpers.
- `services/indic-local` — optional self-hosted Indic STT (IndicConformer), implements the `indic_local` provider contract; uv-managed, no Docker.
- `services/voice` — NOT a pnpm workspace; uv-managed. Only component (besides Next server routes) allowed to hold the service-role key.
- `supabase/migrations` — SQL applied to the hosted project.

## Provider selection (config-driven)

Env picks: `TELEPHONY_PROVIDER`, `DEFAULT_STT_PROVIDER`, `DEFAULT_TTS_PROVIDER`, per-language overrides
`STT_PROVIDER_<LANG>` / `TTS_PROVIDER_<LANG>`, `STT_FALLBACK_PROVIDER`, `TTS_FALLBACK_PROVIDER`, `GROQ_MODEL_*`.
Adapters register in a factory; adding one never touches the bot pipeline.

## Conversation rules the pipeline depends on

- The bot itself records assistant replies and scripted lines into the LLM context (`AssistantMemory`); do not rely on TTS providers emitting spoken-text frames.
- Barge-in: `MinWordsUserTurnStartStrategy` + strict VAD + `TranscriptFilter`; tunables are env vars (`BARGE_IN_MIN_WORDS`, `VAD_*`).
- Groq reasoning models: `reasoning_effort` is derived from the model id (gpt-oss: low, qwen: none).

## Runtime flows

- Browser demo / dev: web -> `POST /webrtc/offer` (voice service, SmallWebRTC) -> pipeline with a demo persona (no real data).
- Scheduled call: worker `enqueue_due_calls` -> `claim_due_calls` (SKIP LOCKED) -> `TelephonyProvider.dial` (inline TwiML) -> media WS `/telephony/ws` -> same pipeline -> post-call jobs -> push.
- Mobile/web "Call now": app -> web `/api/calls/now` (verifies user + family via RLS) -> voice `POST /calls/dial` (service key).
- Post-call: summary JSON -> `call_summaries`, memories (deduped by key), follow-ups, Memory Lane story (unshared), pattern flags, family push + `notifications` row.

## Storage model

- Postgres: all relational data. RLS on every table.
- Storage buckets: `recordings` (private, opt-in), `memory-lane` (private). Signed URLs only.

## Auth and access

- Supabase Auth (magic link, Google). Family members access only their family's rows via RLS.
- Voice service uses the service-role key server-side only. Admin = `is_admin` in app_metadata.

## Invariants

1. Service-role key never ships to a client.
2. No Docker files. No `supabase start`.
3. No hard-coded language/voice/provider/model in pipeline code.
4. Edge TTS only when `DEV_ONLY=true` and `APP_ENV != production`; service refuses to boot otherwise.
5. Every safety decision is logged with an evidence quote. The agent never gives medical/legal/financial advice or asks for OTP/bank details.
6. PII masked in logs; every log line carries `call_id`.
7. Pipeline stays cascade (STT -> LLM -> TTS) behind interfaces so speech-to-speech can be swapped in later.
