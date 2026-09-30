# Progress Tracker

## Current Phase
Built and running end to end on the owner's real Groq + Supabase accounts. Remaining work is external setup (Twilio number, Supabase Auth URLs, better STT/TTS providers) and product polish, listed below.

## What works (verified live, not just in tests)
- Hosted Supabase project `doxwfizatdedzvstjast`: both migrations applied (`pnpm db:apply`), RLS on every table, service key + public key verified, anon locked out of data and scheduler RPCs.
- Web sign-in with Supabase (dev password form) -> add-parent wizard -> real rows saved. Login page fixed: root `.env` is copied to `apps/web/.env.local` by `scripts/sync-env.mjs` (predev/prebuild) because Next did not see the root file. No Clerk needed.
- Voice: real WebRTC calls (simulated parent, synthesized speech) in all 9 languages (mr hi en gu ta te kn bn ml): agent replies in the right script, remembers the conversation, transcripts saved with both sides. Real-parent call: consent recorded, fall detected by keyword -> scripted emergency line with 112 -> flag saved with evidence quote -> family notification rows -> English summary for the family.
- Groq models chosen by benchmark (2026-09-30): conversation + fast classifier `qwen/qwen3.8-27b` (~250 ms TTFT, reasoning off), summary + fallback `openai/gpt-oss-120b`, STT `whisper-large-v3`. Reasoning effort is derived per model family (`llm.reasoning_effort`).
- Interruption fix: barge-in needs `BARGE_IN_MIN_WORDS` (3) words while the agent speaks (`MinWordsUserTurnStartStrategy`); stricter Silero VAD (`VAD_CONFIDENCE`, `VAD_MIN_VOLUME`, `VAD_START_SECS`); junk-transcript filter (Whisper hallucinations on noise); opening/consent line cannot be interrupted by noise.
- Tests: 47 voice (pytest, incl. full pipeline wiring), 15 RLS on PGlite, 24 web E2E, 7 web unit, 31 shared/tokens, expo-doctor 21/21, Android bundle exports.

## Mobile fixes (2026-09-30, from the owner's Expo Go run)
- `expo-notifications` throws at import in Expo Go on Android (SDK 53+); that cascaded into "missing default export" and "ErrorBoundary of undefined". It is now required lazily and only where supported (`lib/notifications.ts`, `pushSupported`); push needs a development build.
- `useFamily outside FamilyProvider`: Settings and Add-parent are root modal routes; `FamilyProvider` moved to the root layout. Add-parent refreshes the family after saving.
- `localhost` URLs are swapped for the Metro host IP on devices (`config.reachable`), so Call now / voice previews reach the computer.
- Dev password sign-in on the mobile sign-in screen (`__DEV__` only). Skia orb has a plain View fallback on web; Skia style flattened.
- Verified: typecheck, Android bundle export, and the app rendering sign-in and welcome screens at runtime on the web target. NOT verified on a real phone.

## Supabase Auth (owner action; only email provider is enabled today)
- The "OAuth Server" app in the Supabase dashboard is the wrong feature (it lets other apps sign in *with* Haalo accounts). Google sign-in needs Authentication > Providers > Google with a Google Cloud OAuth client (callback `https://doxwfizatdedzvstjast.supabase.co/auth/v1/callback`).
- Authentication > URL Configuration: Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/auth/callback`, `haalo://**`, and `exp://**` (Expo Go).

## Known gaps and what is left (feature-wise)
1. **Twilio phone number**: `TWILIO_PHONE_NUMBER` not set, so telephony is disabled. Needs the number, a public tunnel URL (`PUBLIC_VOICE_BASE_URL`), and the inbound webhook set on the number. Trial: verified numbers only, callee presses a key, 10 min cap.
2. **Supabase Auth dashboard settings** (owner action): Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/auth/callback` and `haalo://**`; Google provider needs an OAuth client; built-in email sending is rate-limited (custom SMTP e.g. Resend for real users).
3. **Speech quality without Bhashini**: Edge TTS (dev only) first audio takes ~1.2-1.5 s (fresh websocket per sentence), so replies land in 2-3 s after the parent stops. Whisper mishears Marathi/Kannada/Malayalam words (LLM copes). Options, in order: (a) `services/indic-local` IndicConformer STT (MIT, free, CPU; needs owner's Hugging Face token + ~GBs download); (b) Google Cloud TTS free tier (Standard 4M, WaveNet/Chirp3-HD 1M chars/month per Google's pricing as surfaced 2026-09; needs a GCP billing account; adapter NOT written yet); (c) Sarvam (official free credit is only Rs 100, TTS Rs 3 per 1k chars, adapter exists); (d) Bhashini when approved (adapter exists, untested).
4. Transcript order glitch: scripted emergency/scam lines are added to the LLM context before the parent's turn text, so they can appear one line early in stored transcripts. Cosmetic.
5. Exotel/Plivo adapters (add before paying customers; read their docs first). Sentry not wired. Load test not done. Lighthouse mobile 54 (target 90; hydration/LCP work remains). Native-speaker review of all scripted strings and emergency phrases. Legal drafts have placeholders. Pricing plans and domain undecided.
6. Not yet run on a device: mobile app (Maestro flows written), push notifications (needs EAS project id + dev build).
7. Nice-to-have next: multi-parent call scheduling UI polish, prescription photo upload (stored, never sent to AI), Memory Lane audio playback with signed URLs, per-parent silence/pace controls in Settings, WhatsApp/SMS alerts (only if configured).

## Architecture Decisions (additions this session)
- Conversation memory is owned by the bot (`AssistantMemory` processor + explicit scripted lines): Pipecat's assistant aggregation did not receive spoken text from custom TTS services, so the LLM previously never saw its own replies.
- Transcript = ordered LLM context rebuilt at call end (`_rebuild_turns`).
- Model-path safety verdicts must quote words the parent said (`_verify_verdict`); scripted emergency lines only fire on keyword hits or a grounded model "emergency". A classifier over-fired on ordinary knee pain in Bengali before this.
- `latency_p50/p95_ms` store response latency after the end-of-turn decision (LLM + TTS); the deliberate patience wait for slow speakers is excluded and logged separately.
- Honorifics have native-script forms (`honorifics_native` in the registry) so native voices read them properly.
- Edge TTS streams MP3 through an incremental decoder; provider failover marks a custom provider unusable after two consecutive failures.
- Dev-only password sign-in on /login (hidden in production). Users: `supabase/create_dev_user.py`.

## Session Notes
- Restart both servers after any `.env` change (Next reads env at boot; voice too). Voice logs never include local-variable dumps (`diagnose=False`) and mask phone numbers/emails.
- Secrets were pasted into chat by the owner during setup: rotate the Supabase secret key, DB password, Groq key and Twilio auth token before going public.
- The owner asked not to over-invest in tests: keep them proportionate, focus on the product.
