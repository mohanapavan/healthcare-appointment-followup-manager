# UI_UPGRADE.md — the visual layer, rebuilt

> **Read this together with `CLAUDE.md`, `DESIGN.md`, and `PLAN.md`.**
> This file **supersedes `DESIGN.md` where they conflict**, and `DESIGN.md` must be
> rewritten at the end of this work to match what was actually built.
> **Nothing in `CLAUDE.md` §1–§7 or §9–§10 changes.** The backend, the schema, the
> concurrency guarantee, the outbox, the LLM fallback, the tests and the write-up are all
> correct and finished. Do not refactor them. If a visual change would require touching a
> service or a migration, stop and find another way.

---

## 0. Why this file exists

The original brief asked for restraint and got it. `DESIGN.md` says *"printed, not glowing"*
and *"neither wants to be impressed"* — and the result is honest, accessible, and completely
forgettable. It reads like a well-built internal admin tool.

The correction: **this should look like the digital front door of a large, well-funded
hospital system.** Not a startup landing page, not a dark-mode SaaS dashboard — an
institution that has an actual design budget. Serious, warm, expensive, and *dense with real
information*.

Two things stay non-negotiable from the old brief because they are correct:
- **No teal, no mint, no violet, no indigo.** Teal is the healthcare cliché; violet/indigo is
  the current AI-app cliché. Neither appears anywhere.
- **Urgency is never communicated by color alone.** Label + weight + position + color, always.

Everything else about the visual system is open, and most of it is changing.

---

## 1. Two registers — this is the core idea

The current design applies one flat visual language to every screen. That is why it feels
thin. A real hospital system has **two registers**, and they look different on purpose:

**Register A — the public surface** (`/`, `/login`, `/register`, error and status pages).
This is where the grader lands first. It should be composed, photographic, generous with
space, and confident. Full-bleed imagery, large type, real editorial rhythm. This is the
lobby: high ceilings, natural light, a receptionist who knows your name.

Right now this is *"a plain, fast credentials form."* That was my instruction and it was
wrong for this audience. Replace it.

**Register B — the operational surface** (patient / doctor / admin portals). Dense,
fast, quiet, professional. No hero images, no decorative photography, no marketing copy.
But it gains what it is missing today: **material depth** — real surface hierarchy, layered
elevation, precise hairlines, considered empty states, and motion that explains state changes
instead of decorating them. This is the ward: everything within reach, nothing shouting.

Getting the *contrast between these two registers right* is most of the perceived quality.
A grader who sees a beautiful lobby and then a serious, dense clinical tool concludes
"someone who has actually seen enterprise software built this." A grader who sees the same
gradient hero on every page concludes the opposite.

---

## 2. Color — extend, don't replace

The six semantic tokens in `DESIGN.md` survive with two adjustments. What is missing is a
**surface system** — the reason the current UI looks flat is that it has one background color
and one text color and nothing in between.

### 2.1 Surfaces (new — this is the highest-impact change in the file)

```css
--surface-sunken:   #E8EAE6;  /* page background behind cards; recedes */
--surface-base:     #F2F3F0;  /* default panel */
--surface-raised:   #FAFAF8;  /* cards, the day rail, anything that floats */
--surface-overlay:  #FFFFFF;  /* modals, popovers, the top of the stack */
--surface-inverse:  #16202C;  /* the doctor's "now" bar, footer, inverted panels */
```

Inverted from the usual: the **page recedes and the content floats**. Today everything sits at
`#F3F4F1` with hairlines drawn on it, which is why it reads as a wireframe. Cards must be
visibly *above* the page.

### 2.2 Ink ramp (new)

```css
--ink-900: #16202C;  /* headings */
--ink-700: #33414F;  /* body */
--ink-500: #5B6875;  /* secondary, labels */
--ink-400: #8A949E;  /* placeholder, disabled */
--ink-line: rgba(22, 32, 44, 0.10);   /* hairlines */
--ink-line-strong: rgba(22, 32, 44, 0.18);
```

Four text weights, not one. A screen where labels, values, and captions all render at the
same darkness is the single clearest signal of an unconsidered UI.

### 2.3 Semantics (kept, one shifted)

```css
--clinical:  #2F5D8A;  /* kept — primary action */
--clinical-deep: #1F4266;  /* hover / pressed / the inverse-panel accent */
--urgent:    #B3423E;  /* kept */
--caution:   #C2701A;  /* shifted more orange, away from the new brass */
--confirmed: #3F7856;  /* kept */
```

Each semantic color also gets a `-wash` at 8% opacity over `--surface-raised` for backgrounds,
and a `-line` at 30% for borders. Never fill a large area with a saturated semantic color.

### 2.4 Brass — the one indulgence

```css
--brass: #9A7B3F;
--brass-line: linear-gradient(90deg, transparent, #9A7B3F 20%, #9A7B3F 80%, transparent);
```

One accent, used **only** in Register A and only as a line, a rule, a small mark, or a
letterform — never as a button fill, never as a background, never a gradient wash. Engraved
plaque, not highlighter. It is the difference between "clinic" and "institution," and it
works because it is rationed to roughly four appearances in the entire product.

**Explicitly forbidden**, restated because these are what the room defaults to: teal/mint;
violet/indigo/`#6366F1`; near-black + acid green; cream `#F4F1EA` + terracotta `#D97757`;
glassmorphism; gradient-filled text; mesh gradients; floating blurred orbs; neon; dark mode
as the primary theme.

### 2.5 Elevation — shadows must be layered, not a single blur

A single `box-shadow: 0 4px 12px rgba(0,0,0,0.1)` is the tell of a default. Use three-part
shadows with a contact shadow, a diffuse shadow, and a top inner light:

```css
--elev-1: 0 1px 1px rgba(22,32,44,.04), 0 2px 6px rgba(22,32,44,.04),
          inset 0 1px 0 rgba(255,255,255,.6);
--elev-2: 0 1px 2px rgba(22,32,44,.06), 0 4px 12px rgba(22,32,44,.06),
          0 12px 32px rgba(22,32,44,.04), inset 0 1px 0 rgba(255,255,255,.7);
--elev-3: 0 2px 4px rgba(22,32,44,.08), 0 12px 28px rgba(22,32,44,.10),
          0 32px 64px rgba(22,32,44,.08), inset 0 1px 0 rgba(255,255,255,.8);
```

Radii: `--r-sm: 6px`, `--r-md: 10px`, `--r-lg: 16px`, `--r-xl: 24px` (Register A only).
Consistent, never mixed within one component.

---

## 3. Type

Keep the three faces — they are a good, unusual set. Fix how they are *used*.

- **Space Grotesk** — display. Currently only on headers. Extend to any number that carries
  meaning at size, and tighten it: `letter-spacing: -0.02em` at `2xl` and above, `-0.03em` at
  `3xl`+. Untracked large display type is what makes a page look unfinished.
- **Inter** — body. Enable optical sizing and turn on `cv05`, `ss01` for a less default look:
  `font-feature-settings: 'cv05' 1, 'ss01' 1; font-optical-sizing: auto;`
- **IBM Plex Mono** — every time, dose, count, countdown, and ID. Already correct.

**Scale — go wider.** The current 1.25 ratio tops out at 2.441rem, which is why nothing on
the page has presence. Add: `4xl: 3.5rem`, `5xl: 4.75rem`, `6xl: 6.5rem` for Register A.

**The display motif: numbers.** Instead of a serif headline (the current AI-design default —
avoid it), the memorable typographic element is **oversized tabular numerals**. The time of
your next appointment set at 6.5rem in Plex Mono on the patient home. The count of today's
patients at 4.75rem on the doctor's day header. Wait time, dose count, days remaining. It is
clinically apt, it is distinctive, and nobody else's submission will do it.

**Measure**: body text capped at `68ch`. Clinical notes and AI summaries at `60ch` and
`1.65` line-height — these are read, not scanned.

---

## 4. Imagery — real photographs, committed to the repo

The app currently has none. This is the second-biggest gap.

**Rules:**
- Download and commit to `public/images/`. Never hotlink. Never use a placeholder service.
- Source from **Pexels** or **Unsplash** (both free for commercial use; Pexels needs no
  attribution). Add `docs/image-credits.md` listing every file, source URL, and photographer.
- Serve through `next/image` with `width`/`height` set, `sizes` set, `priority` on the hero
  only, and a `blurDataURL` placeholder on every one. Export at 2× and let Next downscale.
- Convert to `.webp`. Hero under 250KB, portraits under 60KB each. A slow-loading hero is
  worse than no hero.

**What to shoot for — and what to avoid.** The failure mode here is stock-photo slop: a
smiling doctor with folded arms and a stethoscope against a white background, or a gloved
hand pointing at a floating blue hologram. Both are worse than nothing. Pick:

| File | Depicts | Search terms |
|---|---|---|
| `hero-atrium.webp` | Wide architectural interior, daylight, a real building — atrium, corridor, waiting area. Human scale, few or no faces. | "hospital atrium daylight", "modern clinic interior architecture" |
| `care-consult.webp` | A real consultation, mid-conversation, from a slight distance. Documentary, not posed. | "doctor patient consultation candid" |
| `care-hands.webp` | Close, warm, human — hands, a chart being written, a wristband. No faces needed. | "hands writing medical chart", "patient wristband" |
| `care-pharmacy.webp` | Medication being prepared or dispensed — for the reminders section. | "pharmacist dispensing medication" |
| `doctor-01..08.webp` | Eight portraits. Square, shot at f/2-ish, natural light, neutral background, genuinely varied in age and background. Calm expression — not a grin. | "professional headshot doctor natural light" |

**Treatment (apply consistently or it will look like a moodboard):**
- Uniform grade across all photos: slightly desaturated (~88%), warmth pushed a touch,
  contrast held back. Do it in CSS on the image wrapper so it is one rule, not eight edits.
- Portraits: `border-radius: var(--r-md)`, square aspect, `object-fit: cover`, focal point
  upper-third. Never circles — circles crop the shoulders and read as a social app.
- Hero: `object-position` set so the horizon sits in the upper third; a `--ink-900` scrim at
  55%→0% behind any overlaid text so contrast passes AA regardless of the photo.
- **Zero photography in Register B**, with one exception: the doctor's portrait beside their
  name in the patient's booking flow and appointment card. Faces are functional there — a
  patient recognizes who they are seeing.
- Where a photo is not the answer, do not substitute an icon-in-a-circle. Use a **drawn
  element**: the day rail itself, a dose-schedule strip, a status timeline.

**Empty states** get one custom SVG each, drawn in the token palette, at most three colors,
built from the app's own vocabulary — an empty day rail, a blank chart line, an unfilled
prescription slip. No astronauts, no magnifying glasses, no clipart.

---

## 5. Motion

Install `motion` (framer-motion v11+). The current motion budget of one animation was too
austere; the correct budget is **motion that carries state, and nothing else**.

**Spring, not ease.** Everything interactive uses `type: "spring", stiffness: 380,
damping: 32, mass: 0.9`. Non-interactive reveals use `cubic-bezier(0.2, 0.8, 0.2, 1)` at
`260ms`. Nothing exceeds `400ms`. Nothing animates `width`, `height`, `top`, or `left` — only
`transform` and `opacity`.

**Required, in priority order:**

1. **Layout transitions on the day rail.** `layoutId` on each slot block. When a slot is held,
   confirmed, or released, the rail *rearranges physically* rather than re-rendering. This is
   the single most impressive interaction in the app and it costs about twenty lines.
2. **The hold countdown.** Already the signature. Upgrade it: an SVG ring around the slot
   driven by `strokeDashoffset`, the numerals ticking in Plex Mono, and at 60 seconds
   remaining the ring crosses to `--caution`, at 20 to `--urgent` — with the label changing
   too, since color alone never carries meaning here.
3. **Optimistic hold, and the rollback.** On click the slot lifts (`scale: 1.02`, elevation
   1→2) instantly. On a `409 SLOT_TAKEN` it settles back with a single lateral shake
   (`x: [0,-6,6,-4,0]`, 320ms) and the three alternative slots slide in beneath it, staggered
   40ms. Handling failure gracefully in motion is what separates this from a template.
4. **Route transitions between portal pages** via Next 15's View Transitions — a 180ms
   cross-fade with a 8px rise. Subtle enough that it registers as smoothness, not animation.
5. **Staggered list entry**, 30ms apart, capped at the first 8 items, `opacity 0→1` +
   `y: 8→0`. Once per mount. Never on re-render, never on scroll.
6. **Number transitions.** Any large tabular numeral that changes (countdown, patient count,
   dose remaining) rolls to its new value rather than swapping.

**Forbidden:** scroll-triggered fade-ups on every section; parallax; typewriter text;
bouncing arrows; animated gradient backgrounds; anything looping in the operational portals;
`animate-pulse` used as a substitute for a designed loading state.

`prefers-reduced-motion: reduce` disables all of the above and leaves instant state changes
with a 1px focus-visible outline intact. Test this by actually toggling it in devtools.

---

## 6. Screen-by-screen briefs

### 6.1 `/` — the public landing (new page; highest priority)

The grader's first impression, and currently absent. One scroll, five sections:

1. **Hero.** `hero-atrium.webp` full-bleed, height `min(88vh, 900px)`, scrim, headline in
   Space Grotesk at `5xl` tight-tracked, one sentence of subhead, two buttons ("Book an
   appointment" / "Staff sign-in"). Bottom-left, over the image: a live `--brass` hairline
   with three real numbers from the database in Plex Mono — doctors available today,
   specialisations, next open slot. **Pull them from the API, not hardcoded.** A landing page
   showing live system state is a flex no template can fake.
2. **How booking works** — three steps, but drawn as a horizontal miniature of the actual day
   rail, so the landing page previews the product's signature element.
3. **What happens around the visit** — the AI pre-visit summary and post-visit summary shown
   as two real, rendered cards using seeded content, with the AI disclosure line visible.
   Honest, and it demonstrates the feature without a screenshot.
4. **Reliability** — a quiet, confident strip: the 1-of-50 concurrency result, the retry
   ladder, calendar sync. Plain sentences with tabular figures, on `--surface-inverse`. This
   is the panel that tells an engineer-grader to go read the code.
5. **Footer** with the brass rule, demo credentials, and links to the README and write-up.

Copy: plain, active, specific. "Book an appointment," not "Seamlessly manage your healthcare
journey." No "AI-powered." No emoji. No badges.

### 6.2 `/login`, `/register`

Split screen: `care-consult.webp` on the left (hidden below 900px), form on the right on
`--surface-overlay` with `--elev-2`. Real labels above inputs, not placeholders-as-labels.
Demo credentials in a `--surface-sunken` block with a copy button — the grader will use it,
so make it one click. Errors inline under the field, in `--urgent`, with an icon and text.

### 6.3 Patient — book

Doctor cards get their portrait, name, specialisation, next-available in Plex Mono, and a
one-line "typically runs on time"-class fact if the data supports it. Selecting a doctor
expands the day rail *in place* with a layout animation rather than navigating away.

The day rail is the star: `--surface-raised`, 64px hours, a moving `--clinical` "now" line
with the time in a small pill, leave as a hatched band, booked slots at 40% opacity with a
lock affordance, open slots as real targets with hover lift. Symptom form slides in as a
right-hand panel while the hold ring keeps counting in the corner — the patient can always
see how long they have.

### 6.4 Patient — my appointments

Top of page: the next appointment as **one large card** — doctor portrait, the date and time
set at `4xl` in Plex Mono, and the countdown in days/hours. Everything else below in a quiet
list. The single most useful fact should be the biggest thing on the screen; today
everything is the same size.

Pre/post-visit summaries in a `--surface-raised` card with a `--brass` left rule, the AI
disclosure line in `--ink-500` at `xs`, and the fallback state clearly marked. Medication
schedule as a **dose strip** — a horizontal 24-hour rail with dose markers — not a table.

### 6.5 Doctor — today

Header on `--surface-inverse`: date, patient count at `4xl`, current time in Plex Mono.
Below, the day rail again, now populated, with high-urgency patients pulled to a pinned strip
above it carrying the word "High" in bold plus the icon plus `--urgent`.

Each appointment row: portrait-free, name, time, chief complaint truncated at one line,
urgency. Click expands inline into the full pre-visit summary with the three suggested
questions as actual list items. Complete-visit form as a sheet from the right, prescription
items adding with a spring, removing with a collapse.

### 6.6 Admin

Densest screen, least decoration. Doctor roster as a real table with tabular numerals and
sticky header. Outbox health as four counters at `3xl` — PENDING / SENT / FAILED / dead-lettered
— above the dead-letter list, each row showing type, attempts, last error truncated, next
attempt, and a retry button. **A `FAILED` count above zero renders in `--urgent` with the word
"needs attention"** — an operational dashboard that stays silent when something is broken is
a broken dashboard.

### 6.7 States

Every screen ships all five: loading (skeletons matching final layout, shimmer at 8% opacity
— never a spinner), empty (custom SVG + one sentence + the action), error (what happened,
what to do, retry where retrying helps), AI-fallback (marked, never hidden), and offline.

---

## 7. Quality floor (unchanged, plus)

- WCAG AA everywhere; AAA on clinical text. Verify contrast on text over photography.
- Full keyboard path through booking. Visible `:focus-visible` ring: 2px `--clinical`,
  2px offset. Focus moves into panels and returns on close.
- 375px works. The day rail scrolls horizontally with snap on mobile and never squashes.
- `prefers-reduced-motion` honored throughout.
- Lighthouse: accessibility ≥ 95, performance ≥ 85 with the imagery in place. Run it. Record
  the numbers in the README.
- No layout shift when images load — every image has explicit dimensions.

---

## 8. How to actually build this without producing slop

**Look at what you build.** This is not optional and it is the whole difference:

```bash
npm i -D playwright && npx playwright install chromium
```

Write `scripts/shoot.ts` that logs in as each seeded role and screenshots every route at
1440px and 390px into `docs/screens/`. Then **open the PNGs and look at them.** For each one
ask: does this look like software a hospital paid for, or does it look like a Tailwind
template? Name the specific problem — flat surfaces, uniform text darkness, everything the
same size, dead whitespace, no focal point — fix it, re-shoot, look again.

Do that loop at least three times per screen. Generating and never looking is exactly how the
current version happened.

**Order of work:**
1. Tokens, surfaces, elevation, type scale in `globals.css`. Nothing else. Re-shoot — the app
   should already look meaningfully better before a single component is redesigned.
2. Shared primitives: `Card`, `Panel`, `Stat`, `Hairline`, `Sheet`, `EmptyState`, `Skeleton`.
3. The day rail — the signature. Spend real time here.
4. Register A: `/`, `/login`, `/register`.
5. The three portals, in the order patient → doctor → admin.
6. Motion pass over the finished layouts. Never build motion and layout at once.
7. Imagery, optimization, Lighthouse.
8. Rewrite `DESIGN.md` to document what was actually built, and re-run its self-critique
   section honestly.

**Commit per screen**, with a screenshot committed alongside. The commit history is part of
what gets graded.

---

## 9. Definition of done

- [ ] `/` exists, is photographic, pulls at least three live numbers from the API, and looks
      like an institution rather than a startup.
- [ ] Four surface levels are visibly distinct on every screen; nothing sits flat on the page.
- [ ] Four ink weights in use; no screen where labels and values are the same darkness.
- [ ] One oversized tabular numeral is the focal point of each portal's home screen.
- [ ] Day rail animates with `layoutId` on hold / confirm / release.
- [ ] The 409 rollback is designed and feels deliberate, not like an error.
- [ ] 12+ committed, optimized `.webp` images with `docs/image-credits.md`.
- [ ] Zero decorative photography inside the portals.
- [ ] Every empty state has a custom SVG in the token palette.
- [ ] Screenshots of every route at both widths committed under `docs/screens/`, and embedded
      in the README.
- [ ] Lighthouse accessibility ≥ 95, performance ≥ 85, numbers recorded in the README.
- [ ] `prefers-reduced-motion` verified by toggling it, not assumed.
- [ ] `DESIGN.md` rewritten to match reality.
- [ ] Nothing under `src/services/`, `src/lib/llm/`, or `prisma/` was modified.
