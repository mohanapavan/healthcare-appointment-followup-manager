# DESIGN.md

## Why not the default AI aesthetic

The brief explicitly rules out near-black+acid, cream+serif+terracotta,
glassmorphism, gradient hero text, floating orbs, scroll fade-ups, emoji
icons, and "AI-powered" badges. Those are landing-page moves. This is a tool
a patient opens while worried about a symptom, and a doctor opens between
patients with six minutes to spare. Neither wants to be impressed. Both want
to find the thing and be done.

So the grounding question for every choice below is: **what does this
object look like in a real clinic?** An appointment card, a day sheet on a
clipboard, a wristband, a prescription slip. Printed, not glowing.

## Tokens

Six named colors — enough to express state without inventing a rainbow:

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F3F4F1` | Page background. Warm-grey, not the cream `#F4F1EA` the brief calls out — daylight without reaching for the same value. |
| `--ink` | `#1E2A38` | Primary text, headers. Navy-black like ballpoint on a chart, not `#000`. |
| `--clinical` | `#2F5D8A` | Primary action — buttons, links, the rail's "now" marker. One confident blue, not a gradient. |
| `--urgent` | `#B3423E` | High urgency, destructive actions. Used sparingly and always paired with a text label — never color alone (WCAG + the brief's own rule). |
| `--caution` | `#B5792A` | Medium urgency, warnings, holds nearing expiry. |
| `--confirmed` | `#3F7856` | Low urgency, success, confirmed state. Muted forest, not mint — avoids the "teal = health app" cliché entirely by not using teal anywhere. |

Every other color (hairlines, disabled states, hover) is `--ink` or
`--clinical` at reduced opacity — no extra named tokens, no drift.

## Type

Three faces, each doing one job:

- **Display** — Space Grotesk. Slightly technical, form-like letterforms —
  reads like a well-designed administrative system, not a marketing site.
  Headers and portal names only.
- **Body** — Inter. Gets out of the way for symptom text, clinical notes,
  everything someone actually reads at length.
- **Tabular** — IBM Plex Mono, `font-variant-numeric: tabular-nums`. Every
  clock time, dose count, and countdown. A day rail where 9:00 and 9:30
  don't align because the font isn't tabular is a bug, not a style choice.

Scale (1.25 ratio, `rem` base 16px): `xs 0.75` `sm 0.875` `base 1`
`lg 1.25` `xl 1.563` `2xl 1.953` `3xl 2.441`.

## Space

4px base unit: `1 2 3 4 6 8 12 16 24` → `4 8 12 16 24 32 48 64 96px`.
The day rail's hour height is fixed at `64px` (the `16` step) — everything
else derives from it, so an hour always occupies the same visual weight
regardless of screen size.

## Signature element: the day rail

Not a month grid. The doctor's actual day, drawn to scale, vertically:
working hours as the lit zone, an hour = 64px, a booking's height is
literally its duration, leave rendered as a hatched band overlaying the
whole day rather than a modal you have to open to understand, and a held
slot carries its own countdown — a shrinking bar on the slot itself,
counting down in the same tabular numerals as everything else — instead of
a toast or a separate timer widget. It's the one thing every other booking
UI abstracts into a dropdown of times. Showing it is the point: this is
what the day actually looks like, blocks and gaps and all.

Motion budget (one orchestrated moment, per the brief): the hold countdown
bar is the only thing that moves without a direct user action causing it.
Everything else responds to a click/keypress and stops. `prefers-reduced-motion`
turns the countdown into a static, updating-every-second numeral instead of
an animated bar.

## Self-critique

Would this come out of a generic "design a healthcare app" prompt?

- **Teal/mint as the primary color** — the single most common healthcare-UI
  tell. Eliminated outright; `--clinical` is blue, `--confirmed` is a muted
  forest green used only for success/low-urgency, never as a brand color.
- **A calendar month-grid for booking** — the generic pattern. Replaced with
  the day rail, which is also the more honest representation of what a
  doctor's day and a slot hold actually are (time-boxed, overlapping,
  expiring).
- **A hero section / marketing framing on login** — cut. The signed-out
  state is a plain, fast credentials form. Nobody "lands" on a clinical
  tool; they're sent to it by a receptionist or a search.
- **Urgency shown as a colored dot or badge alone** — changed to label +
  position + weight per the brief's explicit rule: urgent items sort to the
  top of the doctor's list, carry the word "High" in bold, and use
  `--urgent` — three signals, not one, so it doesn't fail for anyone who
  can't distinguish the color.
- Where I kept something a generic prompt might also produce (card-based
  layouts, a top nav per portal) it's because clipboards and charts *are*
  cards in real life — the vernacular calls for it, not habit.
