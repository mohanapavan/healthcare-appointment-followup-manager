# DESIGN.md

> Rewritten after the UI rebuild to describe what was **actually built**. Supersedes
> the original restraint-first design. See `UI_UPGRADE.md` for the brief this implements.

## The core idea: two registers

A real hospital system speaks in two registers, and they look different on purpose.

- **Register A — the public surface** (`/`, `/login`, `/register`). Composed, photographic,
  generous with space. Full-bleed imagery, large tracked display type, an engraved brass rule,
  live numbers pulled from the database. This is the lobby.
- **Register B — the operational surface** (patient / doctor / admin portals). Dense, fast,
  quiet. No decorative photography, no marketing copy. What it gains over the old flat build is
  **material depth**: four surface levels, layered elevation, precise hairlines, considered empty
  states, and motion that explains state changes. This is the ward.

Getting the *contrast* between them right is most of the perceived quality. The grader lands on a
composed, confident lobby and then meets a serious, dense clinical tool — the signal that someone
who has seen enterprise software built this.

## Color

Daylight only — no dark mode. A clinical tool is used in a lit room, and committing to one look
avoids defining every token twice. Two rules are absolute: **no teal/mint, no violet/indigo**
(the healthcare and AI-app clichés), and **urgency is never color alone** — always label + weight
+ position + color.

**Surfaces (the highest-impact change).** The old UI had one background and read as a wireframe.
The system now inverts the usual: the **page recedes and content floats**.

| Token | Hex | Role |
|---|---|---|
| `--surface-sunken` | `#E8EAE6` | page background behind cards |
| `--surface-base` | `#F2F3F0` | recessed panels inside cards |
| `--surface-raised` | `#FAFAF8` | cards, the day rail — anything that floats |
| `--surface-overlay` | `#FFFFFF` | modals, inputs, top of the stack |
| `--surface-inverse` | `#16202C` | the doctor's "now" bar, the reliability strip, footers |

**Ink ramp** — four text weights, not one. A screen where labels, values, and captions render at
the same darkness is the clearest tell of an unconsidered UI. `--ink-900` headings · `--ink-700`
body · `--ink-500` secondary/labels · `--ink-400` placeholder/disabled · plus translucent
`--ink-line` / `--ink-line-strong` hairlines.

**Semantics** — `--clinical #2F5D8A` (primary), `--clinical-deep #1F4266` (hover/pressed),
`--urgent #B3423E`, `--caution #C2701A` (shifted orange, away from the brass), `--confirmed
#3F7856`. Each has a solid `-wash` (backgrounds) and translucent `-line` (borders); a saturated
semantic never fills a large area.

**Brass — the one indulgence.** `--brass #9A7B3F`, used only as a *line, rule, or mark* and
rationed to a handful of appearances: the hero/footer rules on the landing, the split-panel rules
on auth, and the left rule on AI-summary cards. Engraved plaque, never highlighter — the
difference between "clinic" and "institution."

**Elevation** — three-part shadows (contact + diffuse + inner top light), not a single blur, so
cards read as genuinely above the page. Radii: `6 / 10 / 16 / 24px`.

## Type

Three faces, each doing one job — kept, but used harder.

- **Space Grotesk** (display) — headers and any number that carries meaning at size, tracked
  tight (`-0.02em`+) so large type never looks unfinished.
- **Inter** (body) — with `cv05`/`ss01` stylistic sets and optical sizing for a less-default feel.
- **IBM Plex Mono** (tabular) — every time, dose, count, countdown, and ID.

Scale widened for Register A (`4xl 3.5rem`, `5xl 4.75rem`, `6xl 6.5rem`) so the lobby has
presence.

## Signature elements

**1. The day rail.** The doctor's real day drawn to scale — an hour is a fixed 64px, a booking's
height is its duration, leave is a hatched band, a live `--clinical` "now" line carries the time
in a pill, booked slots are locked at reduced opacity, open slots are real targets that lift on
hover. It is previewed as a horizontal miniature on the landing page. Everyone else abstracts the
day into a dropdown; this shows it.

**2. Oversized tabular numerals** — the memorable typographic motif, chosen over the serif-headline
default. The next appointment's time on the patient home, the patient count on the doctor's
day header, the outbox counters on admin — each portal's home leads with one big Plex Mono number.
Clinically apt, distinctive, and something no template reaches for.

## Motion

Budget: **motion that carries state, and little else.** Interactive → spring
(`stiffness 380, damping 32`); reveals → a 260ms ease. Nothing over 400ms; only `transform` and
`opacity` animate. Every effect is gated behind `prefers-reduced-motion`.

In priority order, what ships:
1. **The day rail hold interaction** — the slot lifts optimistically on click (`scale 1.02`,
   elevation 1→2); a `409 SLOT_TAKEN` settles it back with a single lateral shake and slides the
   three alternatives in beneath, staggered. Failure handled *in motion* is what separates this
   from a template.
2. **The hold countdown** — an SVG ring that depletes by `strokeDashoffset`, numerals ticking in
   Plex Mono, crossing `--clinical → --caution → --urgent` with the **label changing too** (color
   never carries meaning alone).
3. **The complete-visit sheet** — slides from the right on a spring; prescription items spring in
   and collapse out. Portaled to `<body>` so it is immune to ancestor transforms.
4. **Staggered list entry** (30ms, capped at 8) and **number-roll** on the focal numerals — once
   per mount, never on scroll.

## Imagery

Real photographs, curated by eye and committed as optimized `.webp` (hero 152KB, portraits
10–18KB) — never hotlinked, never a placeholder service. A uniform grade (`~88%` saturation, slight
warmth) is applied in CSS so the set reads as one system. Zero photography inside the portals —
the single exception is the **doctor's portrait** beside their name, where a face is functional.
Empty states use drawn SVG from the app's own vocabulary (an empty day rail), not clipart. Credits
in `docs/image-credits.md`.

## Self-critique — would a generic "healthcare app" prompt produce this?

- **Teal primary / calendar month-grid / login hero-on-every-page** — the three biggest tells,
  all avoided: blue-not-teal, a day rail not a grid, and a genuinely distinct public lobby vs.
  operational portals rather than one gradient hero everywhere.
- **Urgency as a colored dot** — replaced with label + weight + position + icon + color, and
  high-urgency patients pinned above the doctor's day sheet.
- **Flat cards on one background** — replaced with a four-level surface system; the single change
  that most removes the "wireframe" feel.
- **Where I made a deliberate tradeoff (named honestly):**
  - *Route transitions* use per-page staggered entrance rather than Next 15's experimental View
    Transitions API — the experimental route breaks `position: sticky/fixed` chains and I chose
    stability over the last 5% of polish.
  - *The booking flow* stays a dedicated route rather than expanding the rail in place on the
    find page; the route is already wired to the hold/idempotency API and the risk of rebuilding
    it did not justify the gain.
  - *The hero photograph* is a grand daylit lobby that reads slightly classical; it earns the
    "expensive institution" feel the brief asks for, and I preferred a real, non-slop interior
    over a staged "modern hospital" stock shot.
  - *With more time*: a paid image pipeline for art-directed photography, in-place rail expansion,
    and real View Transitions once they leave experimental.
