# AI Workflow Rules

## Approach

Spec-driven, phase by phase (Phases 0-6; status in `progress-tracker.md`). Read the six context files before building.
Keep context small: update these files instead of re-explaining in chat.

## Scoping

- One feature unit at a time; small verifiable increments; don't mix system boundaries in one step.
- Split a step if it mixes UI + background jobs, unrelated routes, or behaviour undefined in context files.

## Missing requirements

- Don't invent product behaviour. Ambiguous product decision: ask the owner. Log open questions in the tracker.

## Env / credentials protocol

- When a value is needed in `.env`, tell the owner exactly which keys and where to get them, then pause that unit.
- `.env.example` is the source of truth for names; never commit secrets. Never invent env var names; check provider docs.

## Cost protocol

- Anything that costs money: stop, state the cost, keep a free fallback. Twilio trial is the free telephony path.

## Protected files

- `components/ui/*` (shadcn output): restyle via tokens, don't fork logic. Applied `supabase/migrations/*` are append-only.

## Before the next unit

1. Works end to end in scope. 2. No invariant broken. 3. Tracker updated. 4. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `uv run pytest` pass.
