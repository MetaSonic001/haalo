# Progress Tracker

## Current Phase
Hackathon build (Symphony 2026 Abhyas buildathon, 15 Oct to 20 Nov 2026). Core product plus the care features below are built and verified on the owner's real Groq + Supabase accounts, with a public **demo workspace** (made-up family, real working features) and a scripted **demo video pipeline** (`tools/demo-video`). Remaining work is external setup (Twilio/Exotel number, Clerk-Supabase connection, better STT/TTS providers) and polish, listed below.

## Care features (2026-10-25, verified live unless noted)
- **Doses**: `dose_events` generated from `medicines.times` (`doses.py`); `CareEngine.tick` (scheduler) calls for due doses (a check-in due within 60 min asks instead), retries once after 20 min, marks missed after 90 min, notifies the family, escalates for `critical` medicines. Calls have a `purpose` (checkin | reminder | inbound | alert). Tools `confirm_dose`, `log_vital`, `request_family_help` run non-blocking (DB write in the background); the post-call safety net re-reads a reminder transcript if the model forgot the tool. Stock decrements on each taken dose; refill notice at 5 days left.
- **Escalation ladder** (`escalation.py`): family push at once, then each contact by priority (alert call that reads the message + press 1, and SMS), waiting `ESCALATION_STEP_SECONDS`; stops on any acknowledgement (web, mobile, key press). Without a calling number the steps are recorded as `simulated` (never as sent). Triggers: emergency flag, N missed days, missed critical dose, parent asked for the family, manual test. Real conference-bridging is NOT built.
- **Vitals** (`vitals.py`): spoken or photographed BP/sugar/weight/temperature/SpO2/pulse; alert thresholds are configurable per parent and are alerts, not diagnoses. **Photo proof**: `/p/<token>` page (no sign-in) -> vision model (Groq qwen) reads pill strips/BP monitors, marks the dose taken or saves the reading.
- **Family messages** (note or question) are delivered on the next call in the parent's language; delivery is only recorded when the post-call analysis confirms it was said; the answer is stored. **Appointments**, **festival/birthday greetings** (only the family-chosen tradition, `holidays` package), **weekly insights + digest** (mood, talkativeness, sleep, meals, adherence, BP trend; wording is "worth a call", never a diagnosis).
- **Web**: Medicines, Health, Safety, Messages, Calendar, Trends, Live demo pages; `/phone/<parent>` = "her phone" (rings when the family taps Call now, answer, live captions); landing page care-loop section.
- **Mobile**: Medicines, Health, More (Safety, Messages, Trends, Calendar) screens; JSON API `/api/care/{data,act,ring}` shared with the website (Clerk bearer or the demo header). Demo build (`HAALO_DEMO_WORKSPACE_URL`) reads the demo family and shows an in-app banner for new notifications (stand-in for push).

## Demo workspace and video
- `DEMO_WORKSPACE=true` + `DEMO_FAMILY_ID`: `/demo` sets a cookie and opens the sandbox family (service-role client, every action guarded by `lib/guard.ts`; add-parent, invites, delete are blocked). Seed/reset: `uv run python -m haalo_voice.demo_seed` (also the "Reset data" button). Sandbox parents are `parents.is_demo` with fictional numbers; the scheduler never dials them.
- Video: `tools/demo-video` (`prep.py` -> `record.mjs`; see its README). Playwright records the real apps; the parents' lines are synthesised speech injected as the microphone, so every call is a real WebRTC call. Output in `demo/`.
- **Groq free tier limits (verified 2026-10-25)**: 8,000 tokens/minute and 200,000 tokens/day per model. One Sneha turn costs ~2.5-3k tokens, so heavy testing exhausts a model for the day. `QuotaAwareGroqLLM` falls back to `GROQ_MODEL_FALLBACK` on HTTP 429; the safety classifier runs on `openai/gpt-oss-20b` (separate quota). Real use needs Groq's paid Developer tier or another provider.
- Whisper (Groq) transcribes the Edge-TTS Marathi lines imperfectly; STT hint words (`parent_context.vocab`) in the parent's script help a lot.

## What works (verified live, not just in tests)
- Hosted Supabase project `doxwfizatdedzvstjast`: both migrations applied (`pnpm db:apply`), RLS on every table, service key + public key verified, anon locked out of data and scheduler RPCs.
- Web sign-in with Supabase (dev password form) -> add-parent wizard -> real rows saved. Login page fixed: root `.env` is copied to `apps/web/.env.local` by `scripts/sync-env.mjs` (predev/prebuild) because Next did not see the root file. No Clerk needed.
- Voice: real WebRTC calls (simulated parent, synthesized speech) in all 9 languages (mr hi en gu ta te kn bn ml): agent replies in the right script, remembers the conversation, transcripts saved with both sides. Real-parent call: consent recorded, fall detected by keyword -> scripted emergency line with 112 -> flag saved with evidence quote -> family notification rows -> English summary for the family.
- Groq models chosen by benchmark (2026-09-30): conversation + fast classifier `qwen/qwen3.8-27b` (~250 ms TTFT, reasoning off), summary + fallback `openai/gpt-oss-120b`, STT `whisper-large-v3`. Reasoning effort is derived per model family (`llm.reasoning_effort`).
- Interruption fix: barge-in needs `BARGE_IN_MIN_WORDS` (3) words while the agent speaks (`MinWordsUserTurnStartStrategy`); stricter Silero VAD (`VAD_CONFIDENCE`, `VAD_MIN_VOLUME`, `VAD_START_SECS`); junk-transcript filter (Whisper hallucinations on noise); opening/consent line cannot be interrupted by noise.
- Tests: 47 voice (pytest, incl. full pipeline wiring), 15 RLS on PGlite, 24 web E2E, 7 web unit, 31 shared/tokens, expo-doctor 21/21, Android bundle exports.

## Auth is now Clerk (web + mobile); Supabase holds data only
- Web: `@clerk/nextjs` (`proxy.ts` clerkMiddleware protects /app, /admin, /invite; `<SignIn>` at /login; `ClerkProvider` in the root layout only when keys exist). Mobile: `@clerk/expo` with email-code sign-in/sign-up and Google SSO (custom screens, works in Expo Go).
- Data access: the Clerk session token is passed to Supabase as the access token (`createClient(..., { accessToken })`), so RLS sees the user via `auth.jwt() ->> 'sub'`. Clerk ids are text (`user_...`), so migration `20260930000003_clerk_user_ids.sql` (applied) converted every user column to text and rewrote all policies around `requesting_user_id()`. `profiles` rows are created on first sign-in (`ensureProfile`) or by `create_family`.
- Mobile "Call now" sends the Clerk token as Bearer to web `/api/calls/now`; Clerk middleware authenticates it.
- Demo mode: no Clerk keys = demo data locally; production refuses.
- Admin = Clerk user public metadata `{"is_admin": true}` (web checks it server-side). For RLS admin policies add the session-token claim `{"app_metadata": {"is_admin": "{{user.public_metadata.is_admin}}"}}`.
- **Owner steps still required for live data under RLS** (verified 2026-10-25: a Clerk-issued token is rejected by Supabase with PGRST301 "No suitable key", so these are not done yet): (1) Clerk dashboard > Integrations/"Connect with Supabase" > activate (adds `role: authenticated` to session tokens); (2) Supabase > Authentication > Third-Party Auth > add Clerk with domain `pleasant-beagle-45.clerk.accounts.dev`. Then (3) in Clerk, set Public metadata `{"is_admin": true}` on your own user. Google sign-in in Clerk dev instances works out of the box.
- The earlier Supabase Auth OAuth-server app is unrelated and can be deleted.

## Mobile fixes (2026-09-30, from the owner's Expo Go run)
- `expo-notifications` throws at import in Expo Go on Android (SDK 53+); that cascaded into "missing default export" and "ErrorBoundary of undefined". It is now required lazily and only where supported (`lib/notifications.ts`, `pushSupported`); push needs a development build.
- `useFamily outside FamilyProvider`: Settings and Add-parent are root modal routes; `FamilyProvider` moved to the root layout. Add-parent refreshes the family after saving.
- `localhost` URLs are swapped for the Metro host IP on devices (`config.reachable`), so Call now / voice previews reach the computer.
- Dev password sign-in on the mobile sign-in screen (`__DEV__` only). Skia orb has a plain View fallback on web; Skia style flattened.
- 2026-10-25: Orb crashed with "[Worklets] Tried to synchronously call a remote function": a plain JS closure ran from `withRepeat`'s UI-runtime completion callback; now a worklet touching only shared values. `GO_BACK was not handled`: all back buttons use `goBack()` (`lib/nav.ts`, falls back to the tabs). `expo-doctor` 21/21 after `expo install --fix` and pinning `@expo/metro-runtime ~57.0.17`.
- Verified: typecheck, Android bundle export, and the app rendering sign-in and welcome screens at runtime on the web target. NOT verified on a real phone.

## Supabase Auth (owner action; only email provider is enabled today)
- The "OAuth Server" app in the Supabase dashboard is the wrong feature (it lets other apps sign in *with* Sneha accounts). Google sign-in needs Authentication > Providers > Google with a Google Cloud OAuth client (callback `https://doxwfizatdedzvstjast.supabase.co/auth/v1/callback`).
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

## Brand + demo shoot (2026-10-25)
- Product = **Heartline**; the AI voice agent = **Sneha**. Every call opens with "I'm Sneha from Heartline, calling on behalf of <child>" (scripted greeting/consent in all 10 languages; reminder and inbound prompts too). Internal identifiers keep `haalo` (`@haalo/*`, `haalo_voice`, `x-haalo-demo`, bundle id).
- Demo voices: Sneha = the language's female Edge voice; parents never share it (women: same voice, -22 Hz, 14% slower; men: male voice).
- Voice service fixes found while filming: post-call work now runs even if the pipeline hangs after hang-up (6 s grace, then cancel); `FamilyMessageNudge` makes sure the family's note and question are passed on (from the parent's second turn); prompt orders messages before appointments/refills.
- Recording flow (headless Playwright, call audio mixed afterwards): `TAKE=<n> ONLY=<scenes> node tools/demo-video/record.mjs`; run the voice service with BARGE_IN_MIN_WORDS=99 DEFAULT_SILENCE_MS=1700 NO_RESPONSE_SECONDS=45 so nobody is cut off. `assemble.mjs pitch` cuts `plans/pitch.json` (supports `zoom: [scale, cx, cy]` eased push-ins) into `demo/heartline-pitch.mp4` (2:49) and `demo/VOICEOVER-pitch.md`.
- Groq free tier: 200k tokens/day per model and 1000 requests/day; one full shoot uses most of it.

## Final demo cut (2026-10-26)
- `demo/Final/final-heartline-demo.mp4` (about 3:30) = the 2:49 pitch extended: a languages beat, the Tamil call with Sneha's reply (the old pitch cut off before it; the audio was always in `take1`, at 392-399 s), Safety + alert history and the Family page from the photo/web footage. Built by `node tools/demo-video/assemble.mjs final` from `plans/final.json`; script in `demo/Final/VOICEOVER-final-heartline-demo.md` (the owner records the voice-over later).
- `assemble.mjs` sources can set `audioFromFile` (use a finished video's own soundtrack): the pitch's raw `t2-morning`/`t3`/`t4` recordings are no longer on disk, so the unchanged parts are re-cut from `heartline-pitch.mp4`.
- `cap-export.mp4` and `run1.mp4` are the OLD "Haalo"-branded shoot (UI and Sneha's speech say Haalo); do not splice them into Heartline videos. They add nothing the new cut lacks.
