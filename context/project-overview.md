# Heartline

## Overview

Heartline phones a family's elderly parents (the AI voice is named Sneha) every day in their own language (Marathi, Hindi, Indian English at launch),
chats warmly, checks medicines, meals, sleep and mood, and sends the adult child a short summary. Anything alarming
(fall, chest pain, confusion, scam call, distress, repeated missed calls) alerts the family immediately.
Tagline: "A daily call for the people who raised you." Hindi/Marathi line: "Roz ka haal-chaal, unki bhasha mein."

## Users and surfaces

- Parent (60+): plain phone call (PSTN). Can call Sneha back. Nothing to install.
- Adult child (payer): Expo mobile app + web dashboard (`/app`).
- Family circle: invited into the same parent profile.
- Heartline team: internal `/admin`.

## Non-negotiable product rules

1. Honest AI: first call says it is an AI assistant set up by the named child and asks consent. Declined = calls stop, child notified.
2. Never gives medical advice. Asks, listens, logs, escalates to family. Emergencies: tell parent to contact family/emergency services, alert family.
3. Parent is in control: "don't call tomorrow" / "call later" is honoured.
4. Privacy by default: recordings opt-in; transcripts visible only to the family circle.

## Founding rules (from the owner)

1. Verify, don't assume: read docs / query APIs before using any external API; pin exact versions; never invent IDs, env vars, endpoints.
2. No Docker anywhere. Hosted Supabase for dev and prod (no `supabase start`).
3. Free and open-source first. If something costs money, stop and tell the owner the cost first; keep a free fallback.
4. Everything config-driven: language, voice, STT/TTS provider, LLM model, telephony provider are chosen via `.env`/config, never hard-coded.
5. Ask the owner when a product decision is ambiguous.
6. When a credential/env value is needed to proceed, tell the owner and pause.
7. Edge TTS is DEV_ONLY (unofficial endpoint). The voice service must refuse to start in production with it configured.

## Scope

In: voice agent (WebRTC + Twilio now, Exotel/Plivo later), Supabase data model + RLS, post-call summaries/memory/flags,
Expo family app, Next.js landing/dashboard/admin, eval harness, observability.
Out (v1): speech-to-speech models, phone-OTP auth, billing (free pilot only).

## Success criteria

1. 5-minute Marathi conversation in the browser, median response < 1s, barge-in works, emergency phrases trigger the scripted response.
2. Scheduled call rings a real phone, runs consent, produces a summary; missed calls retry then notify.
3. Full family flow on a device: sign in, add parent, first call, push summary, call detail, acknowledge flag.
4. Lighthouse mobile >= 90 on `/`. RLS tests pass. Killing the primary STT mid-call falls back without dropping the call.
