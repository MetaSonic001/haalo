# Haalo

*A daily call for the people who raised you.* Haalo phones your parents every day in their own language, checks on medicines,
meals, sleep and mood, and sends the family a short summary. Anything worrying (a fall, chest pain, a scam call, distress,
repeated missed calls) alerts the family immediately.

```
apps/web        Next.js 16: landing + live voice demo, family dashboard (/app), admin (/admin)
apps/mobile     Expo SDK 57: the family app (Skia orb, push, haptics, offline Today)
packages/       ui-tokens (design tokens + AA contrast tests), shared (schemas, language registry), db (types, RLS tests)
services/voice  Python (uv): Pipecat voice agent, scheduler, post-call jobs, FastAPI
supabase/       SQL migrations (hosted project, no Docker)
context/        Project docs the AI workflow reads first (see CLAUDE.md)
```

## Quick start

Requirements: Node 22+, pnpm 10, Python 3.12, [uv](https://docs.astral.sh/uv/). No Docker anywhere.

```bash
pnpm install
cp .env.example .env          # then fill in what you have (see "What you need" below)
pnpm db:apply                 # applies supabase/migrations to your hosted project (needs DIRECT_URL)
pnpm dev                      # web (3000) + mobile (Expo) + voice (7860) via Turborepo
```

Each part also runs alone: `pnpm dev:web`, `pnpm dev:mobile`, `pnpm dev:voice`.
With **no keys at all** the web app and mobile app run on demo data, so you can explore the whole UI.

## Everything is configured from `.env`

Swap providers by changing values, never code. `.env.example` documents every key.

| To change | Set |
| --- | --- |
| Telephony | `TELEPHONY_PROVIDER=twilio` (Exotel/Plivo adapters are added before paying customers; same setting) |
| Voice (TTS) | `DEFAULT_TTS_PROVIDER=edge \| sarvam \| bhashini \| indic_local \| groq_orpheus`, per language: `TTS_PROVIDER_MR=sarvam` |
| Speech-to-text | `DEFAULT_STT_PROVIDER=groq_whisper \| sarvam \| bhashini \| indic_local`, per language: `STT_PROVIDER_HI=sarvam` |
| Failover | `STT_FALLBACK_PROVIDER`, `TTS_FALLBACK_PROVIDER` (per language too): switches automatically mid-call |
| LLM | `GROQ_MODEL_CONVERSATION / _FAST / _SUMMARY / _FALLBACK` (validated against Groq's `/models` at startup) |
| Languages | `packages/shared/languages.json` (one file read by web, mobile and the voice service) |

Edge TTS is an unofficial endpoint: it only works with `DEV_ONLY=true` and the service refuses to start with it in production.

## What you need to run each phase

| Phase | You provide |
| --- | --- |
| 1. Talk to Haalo in the browser | `GROQ_API_KEY`, then `uv run haalo-models` (in `services/voice`) to pick `GROQ_MODEL_*` |
| 2. Real data | A hosted Supabase project: URL, public key, service-role key. Apply `supabase/migrations/*` (`supabase db push`) |
| 3. Real phone calls | Twilio SID/token/number, and a public URL for the voice service (`cloudflared tunnel --url http://localhost:7860` or ngrok) |
| Better voices | `SARVAM_API_KEY` (paid after free credits) or Bhashini keys (free, best effort) or a self-hosted `INDIC_LOCAL_URL` |

## Checks

```bash
pnpm turbo run lint typecheck test      # TS + tokens + shared + RLS policy tests (PGlite)
cd services/voice && uv run pytest      # voice: config guards, safety, prompt, telephony, full pipeline wiring
cd apps/web && pnpm e2e                 # Playwright (uses your installed Chrome)
cd apps/mobile && npx expo-doctor       # Expo health
```

See `services/voice/README.md` for the voice agent, evals and Twilio setup, and `context/` for architecture and progress.
