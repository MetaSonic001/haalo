# Code Standards

## General

- Small single-purpose modules. Fix root causes. Anything provider/language/model related is config, not a constant.
- Verify external APIs against current docs before use; pin versions.

## TypeScript

- `strict` everywhere. No `any`; validate external input with zod at boundaries (schemas in `packages/shared`).

## Next.js

- Server components by default; `"use client"` only for interactivity. Route handlers: parse, auth, act.

## Python (services/voice)

- Python 3.12, uv, ruff, pytest. Pydantic settings for config. Type hints required. Async I/O.
- Provider adapters implement the ABCs in `haalo_voice/providers/base.py` and register in the factory.
- JSON logs with `call_id` bound; PII masked.

## Styling

- Tokens only (CSS variables / theme object); no hard-coded hex in components.

## API routes

- Validate input, enforce auth + ownership before mutation, consistent `{ ok, data | error }` shapes.

## Data

- Metadata in Postgres, audio in Storage. Migrations append-only. RLS on every table with a SQL test.

## Layout

- `apps/*` apps, `packages/*` shared TS, `services/voice` Python, `supabase/` SQL, `context/` project docs.

## Lessons that became rules

- Never trust a framework's implicit behaviour for something the product depends on (conversation memory, transcripts): assert it with a live call.
- Model-produced safety verdicts must be grounded in the parent's own words before triggering scripted alarms.
- After `.env` changes restart servers; web reads a generated `apps/web/.env.local` (see `scripts/sync-env.mjs`).
- Shell heredocs with apostrophes fail here: write files with the editor tool or a script file.
