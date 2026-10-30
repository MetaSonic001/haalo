# UI Context

## Theme

"Morning call, Indian home": calm morning light, indigo like block-print dye, marigold glow of a diya. Warm, never clinical.
Light and dark. Content left-aligned. Almost no shadows (contrast + spacing separate). Sentence case; no all-caps labels,
no eyebrow labels, no arrow glyphs on buttons.
Modern touches (owner asked for modern and unique): soft aurora/grain gradient behind the orb, bento grid for features,
spotlight-border only on feature/pricing cards, animated beam from "call" to "summary", script marquee for languages.
One signature element: the Sneha orb.

## Colors (source: `packages/ui-tokens`; web = CSS variables, mobile = theme object)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| ink | #1B2246 | bg | Text / dark surfaces |
| morning | #EEF2F8 | text | Background |
| surface | #FFFFFF | #252D57 | Cards |
| marigold | #F3A712 | #F3A712 | Orb, primary CTA, live state (ink text on it) |
| tulsi | #3C8A5A | lifted for AA | All good / taken |
| sindoor | #C8352C | lifted for AA | Alerts only |
| mist | #8A93AD | | Secondary text, dividers (not small text on light) |

Every text/background pair passes WCAG AA (checked by a test in `packages/ui-tokens`).

## Typography

Anek (Google Fonts) for all scripts; load only scripts present in the language registry. Scale 12/14/16/20/25/31/39/49. Line length <= 70ch.

## Radius

Status card 24, list rows 14, chips 999.

## Components

shadcn/ui-style primitives restyled to tokens (web); hand-built RN components (mobile). Inspiration: shadcn, Aceternity,
HeroUI, 21st.dev (patterns only). Icons: Lucide, stroke only.

## Motion

Answers user actions. 150-300ms, springs for physical things, ease-out fades. Orb rings twice on load then breathes; reacts to
audio amplitude in demo/live call. Respect reduced motion. Haptics: light on ticks, success on first call scheduled, warning on emergency alert.

## Copy voice

Plain, warm, specific ("Aai sounded cheerful and took her BP tablet"). Buttons say exactly what happens. Errors explain the fix.

## Decisions made while building (owner asked for a modern look)

- Dark mode is driven by `prefers-color-scheme` plus `data-theme`; tokens are injected from `@haalo/ui-tokens` in the root layout (single source).
- `text-muted` is `slate #525C7E` on light (AA); `mist #8A93AD` is for dividers/large text only.
- Buttons: primary = marigold fill with ink text; "ink" variant is theme-aware (`bg-text text-bg`), never a fixed colour.
- Headlines: Anek Latin at width 118% (`.display`); other scripts use normal width.
- Only the morning-summary section animates on scroll; the orb is the one signature animation. Reduced motion disables both.
- Never colour alone: mood/severity chips always carry words.
