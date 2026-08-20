# CLAUDE.md — Healthcare Appointment & Follow-up Manager

## What this is
A graded take-home for a company. It is scored on the evaluation criteria below, not on
feature count. Assume ~1000 candidates submit a working CRUD booking app. The submission
wins on **correctness under concurrency, failure handling, schema design, and documentation** —
the four things almost everyone fakes.

## The grader's rubric (from the brief, verbatim priority order)
1. Problem-solving approach for slot conflicts, leave management, notification reliability
2. LLM prompt quality and failure handling
3. Database schema design
4. API design and code structure
5. Email and Google Calendar integration
6. Documentation

**Build in that order. Never trade #1 for a nicer feature.** If time is short, ship fewer
features executed to production standard rather than every feature at demo standard.

## Hard rules
1. **Nothing is done until it is proven.** Every claim in the write-up must have a test,
   a script, or a log excerpt behind it. Especially the concurrency claim.
2. **No fire-and-forget side effects.** Email and calendar writes never happen inline in a
   request handler. They go through the outbox (see §Notification reliability).
3. **The LLM is never on the critical path.** A booking must succeed with the LLM provider
   down, timing out, or returning garbage. Test this by pointing the key at a dead host.
4. **This is healthcare.** The LLM does not diagnose. It summarises and triages for a
   clinician's convenience. Every AI-generated surface carries a visible "AI-generated,
   reviewed by your doctor" line. Red-flag symptoms are escalated by deterministic rules,
   not by the model.
5. **Server-side authorization on every route.** Role checks in the UI are cosmetic. A
   patient hitting a doctor's endpoint by ID must get 403, and there must be a test for it.
6. **Commit in small, readable commits** with real messages. The grader reads the git log.
7. **No secrets in the repo.** `.env.example` only, with every var documented.

## Stack (fixed — do not deviate without asking)
- **Next.js 15 (App Router) + TypeScript** — one repo, one deploy, API routes and UI together.
- **PostgreSQL** (Neon or Render free tier) + **Prisma**. Postgres is non-negotiable: the
  double-booking guarantee depends on real transactions, unique constraints, and row locks.
  SQLite cannot demonstrate this and will cost points.
- **Auth**: Auth.js (NextAuth) credentials provider + bcrypt, JWT sessions, role claim.
- **Email**: Resend or Nodemailer + Ethereal for local. Provider behind an interface so it
  is swappable and mockable.
- **Google Calendar API** with OAuth 2.0, offline access, refresh-token storage.
- **LLM**: Google Gemini free tier (or OpenAI-compatible). Behind an interface with a
  deterministic fallback implementation.
- **Background jobs**: a `/api/jobs/tick` route drained by the host's cron (Vercel Cron or
  Render Cron, every minute). Free hosting has no long-lived worker — say so in the write-up
  and explain the tradeoff. This is a judgment signal, not a limitation to hide.
- **Testing**: Vitest + a real Postgres test database. Not mocks for the concurrency tests.

---

## §1 Slot conflicts — the centrepiece

This is the highest-weighted item. Most submissions do `if (!existing) create()`, which is a
check-then-act race that fails under load. Do all four layers:

1. **Database constraint as the source of truth.**
   `UNIQUE (doctorId, startsAt)` on a `Booking` table, partial-indexed to ignore cancelled
   rows: `CREATE UNIQUE INDEX ... WHERE status IN ('HELD','CONFIRMED')`.
   The database, not application code, is what makes double-booking impossible.
2. **Transaction + explicit lock.** Wrap the read-check-write in a serializable transaction,
   or take a `pg_advisory_xact_lock` keyed on `hash(doctorId, startsAt)`. Catch the unique
   violation (Prisma `P2002`) and return `409 Conflict` with a machine-readable code and the
   next three available slots — a good API turns a conflict into a recovery path.
3. **Slot hold with TTL.** The brief explicitly names a "slot hold mechanism". Booking is
   two-phase: `POST /slots/hold` creates a `HELD` row with `expiresAt = now + 5 min` and
   returns a hold token; `POST /appointments` converts hold → `CONFIRMED` using that token.
   Expired holds are reaped by the job tick and are excluded from the availability query by
   the partial index predicate. Show the countdown in the UI.
4. **Idempotency.** `POST /appointments` accepts an `Idempotency-Key` header; a repeat with
   the same key returns the original result rather than creating a second booking. This is
   what makes double-submit and network-retry safe.

**Required proof:** `scripts/concurrency-test.ts` fires 50 simultaneous booking requests at
one slot with `Promise.all`, and asserts exactly 1 returns 201 and 49 return 409, with 1 row
in the database. Put its output in the README. This single artifact will separate the
submission from nearly every other one.

Availability is **computed, not stored**: derive open slots from the doctor's working hours,
slot duration, leave days, and existing HELD/CONFIRMED bookings. Do not pre-generate a slots
table — it desynchronises the moment a doctor changes their hours.

---

## §2 Doctor leave — conflict handling

Marking leave on a date that already has bookings is a **conflict resolution flow, not a
delete**. Required behaviour:

- The admin/doctor sees a preview: "3 appointments are affected" with the patient list,
  **before** confirming.
- On confirm, in one transaction: bookings move to `CANCELLED_BY_CLINIC` with a reason,
  calendar events are deleted, and notification jobs are enqueued.
- Each affected patient's email includes their specific appointment details and the doctor's
  **next three available slots as one-click rebooking links** — not a generic apology.
- Leave is stored as a date range with a reason, and overlapping leave ranges are rejected.
- Cancellation is never a hard delete. Rows keep their history and an audit trail.

---

## §3 Notification reliability — the transactional outbox

Do not call the email or calendar API inside the request handler. That loses the message on
any crash and blocks the response on a third-party's latency.

- **`OutboxEvent` table**: `id, type, payload(jsonb), status, attempts, nextAttemptAt,
  lastError, createdAt`. The domain write and the outbox insert happen **in the same
  transaction**, so a booking can never exist without its notification queued, and vice versa.
- **Worker** (`/api/jobs/tick`): claims due rows with `FOR UPDATE SKIP LOCKED` (safe against
  overlapping cron runs), dispatches, and on failure sets `nextAttemptAt` by exponential
  backoff with jitter: 1m, 5m, 25m, 2h, 12h.
- **Dead-letter**: after 5 attempts, status `FAILED`, surfaced on the admin dashboard with
  a manual retry button. Failures must be visible, not silent.
- **Idempotent dispatch**: store the provider's message ID; never send the same event twice.
- Medication reminders are scheduled outbox rows generated from the prescription frequency
  at the time the prescription is saved — one row per dose window, not a cron that re-derives.

---

## §4 LLM integration — quality and graceful failure

**Prompt quality** (a graded item — treat prompts as source code, in `lib/llm/prompts.ts`,
versioned, with the version stored alongside every output):
- Force structured output: request strict JSON, define the schema in the prompt, and
  **validate the response with Zod**. A response that fails validation is a failure, not a
  result — retry once with the validation error appended, then fall back.
- Give the model a role, hard constraints, and an explicit refusal path. The pre-visit prompt
  must state that it does not diagnose, must not invent symptoms the patient did not report,
  and must return `"urgency": "High"` for any red-flag symptom.
- Few-shot with 2 examples, including one edge case (vague or empty symptom text).
- Post-visit summary: constrain reading level, require a medication schedule table and
  explicit follow-up steps, and forbid adding any medication not present in the notes.

**Failure handling** (test each of these — the brief asks for it explicitly):
- Timeout at 10s, single retry with backoff, then fall back.
- **Deterministic fallback**: a rules-based summariser (keyword red-flag list → urgency,
  symptom text passed through verbatim, prescription rendered from structured DB fields).
  The doctor always gets *something*. Mark it `source: "fallback"` in the DB and in the UI.
- **Circuit breaker**: after 3 consecutive provider failures, skip calling for 60s and go
  straight to fallback.
- Store `rawResponse`, `parsedOutput`, `promptVersion`, `model`, `latencyMs`, `source`,
  `tokenCount` on every generation. This is what makes the feature auditable — and in
  healthcare, auditability is the point.
- **Never send identifying fields** (name, email, phone, DOB) to the LLM. Send symptom text
  and clinical notes only. State this in the write-up; it is a real compliance instinct and
  almost nobody will think of it.

---

## §5 Schema design

Model these explicitly rather than bolting fields onto two tables:
`User(role)` · `DoctorProfile(specialisation, slotDurationMins)` · `WorkingHours(dayOfWeek,
start, end)` · `Leave(dateRange, reason)` · `Booking(status, startsAt, endsAt, holdExpiresAt,
idempotencyKey)` · `SymptomSubmission` · `AiGeneration(polymorphic, with the audit fields
above)` · `Prescription` + `PrescriptionItem(frequency, durationDays)` · `OutboxEvent` ·
`CalendarLink(bookingId, provider, externalEventId, ownerUserId)` · `AuditLog(actor, action,
entity, before, after)`.

Rules: every timestamp stored UTC (`timestamptz`) with the clinic timezone held separately —
appointment systems die on timezone bugs. Booking status is a real enum driving a state
machine (`HELD → CONFIRMED → COMPLETED | CANCELLED_BY_PATIENT | CANCELLED_BY_CLINIC | NO_SHOW`),
with illegal transitions rejected in one place. Index what you query: `(doctorId, startsAt)`,
`(patientId, startsAt)`, `(status, nextAttemptAt)` on the outbox. Ship a real ER diagram
(Mermaid, in the README).

---

## §6 API design

- REST, resource-nouns, plural. `/api/doctors`, `/api/doctors/:id/availability?date=`,
  `/api/appointments`, `/api/appointments/:id/cancel`.
- **One error envelope everywhere**: `{ error: { code, message, details? } }` with stable
  machine-readable codes (`SLOT_TAKEN`, `HOLD_EXPIRED`, `DOCTOR_ON_LEAVE`, `LLM_UNAVAILABLE`).
- Zod validation at every boundary; parse, don't trust.
- Correct status codes — 409 for conflicts, 422 for validation, 403 vs 404 chosen deliberately
  so IDs don't leak.
- Rate-limit auth and booking endpoints.
- Structured request logging with a correlation ID threaded through to outbox rows and LLM
  calls, so one booking can be traced end to end.
- Layering: `route → service → repository`. Business rules live in services and are unit-
  testable without HTTP. No Prisma calls inside route handlers.

---

## §7 Google Calendar

- OAuth 2.0 with `access_type=offline`, refresh tokens encrypted at rest.
- Store `externalEventId` per booking per user so reschedule updates and cancel deletes the
  right event on both sides.
- Handle **revoked or expired consent**: catch `invalid_grant`, mark the link broken, notify
  the user to reconnect, and keep the appointment valid. Calendar failure must never roll back
  a booking — it is an outbox event like any other.
- Use the appointment ID as the calendar event's `requestId` / idempotency source so retries
  don't create duplicate events.
- If Google verification blocks live use, ship it working in test mode and document the exact
  steps plus a recorded demo. Say what is limited; never pretend.

---

## §8 Frontend — design direction

**Do not build the default AI aesthetic.** Specifically forbidden: near-black background with
one acid accent; the cream `#F4F1EA` + serif + terracotta `#D97757` combination; glassmorphism;
gradient-filled hero text; floating blurred orbs; scroll-triggered fade-ups on every section;
emoji as iconography; "✨ AI-powered" badges. If it looks like a landing page for a startup,
it is wrong. This is a clinical tool people use while anxious or busy.

**Ground it in the subject.** The vernacular here is appointment cards, day sheets, patient
charts, time rails, wristband tags, prescription slips. Daylight, not dark mode — clinics are
lit. Calm and legible beats impressive.

**Process (follow it, don't skip to code):**
1. Write `DESIGN.md` first: 4–6 named hex tokens, a display face + body face + a tabular-
   numeral utility face, a type scale, spacing scale, and **one signature element** that
   embodies the product. Justify each choice against *this* brief.
2. Self-critique it: would this same plan come out of any generic "healthcare app" prompt?
   Where it would, change it and note what you changed.
3. Only then build, deriving every value from the tokens.

**Suggested signature (take it or beat it):** the booking surface is a **continuous day rail**,
not a month grid — the doctor's real day drawn to scale, with slot duration as physical
height, leave blocks and existing appointments rendered in situ, and the hold countdown
running on the slot itself. It shows the thing everyone else abstracts away.

**Non-negotiable quality floor:**
- Three genuinely distinct portals. A patient booking a slot, a doctor running a clinic day,
  and an admin managing staff are three different jobs — do not ship one dashboard with the
  nav items filtered by role.
- Urgency is communicated by **label plus position plus weight**, never colour alone.
- WCAG AA contrast, visible keyboard focus, real form labels, `prefers-reduced-motion`
  respected, works down to 375px.
- Every state designed: loading (skeletons, not spinners), empty (an invitation to act),
  error (what happened and how to fix it), and the AI-fallback state.
- Optimistic UI on the slot hold, with a clean rollback path on 409.
- Copy in the interface's voice: "Hold this slot", "Slot taken — here are three others".
  No apologising, no cleverness, no filler.

Motion budget: one orchestrated moment (the hold countdown, or the day rail settling into
place). Nothing else moves without a reason.

---

## §9 Deliverables (all four are graded — the write-up is not an afterthought)
1. **Source zip** — clean tree, no `node_modules`, no `.env`, no dead code, no commented-out
   experiments.
2. **README** — setup in under 5 minutes, `.env.example` with every var explained, API docs,
   Mermaid ER diagram, all LLM prompts, Google Calendar OAuth setup steps, seeded demo
   accounts for all three roles, and the concurrency test output.
3. **Hosted URL** — deployed, seeded, with a demo-reset endpoint so the grader can re-run the
   flow. A live booking that emails and lands on a real calendar is the whole demo.
4. **System design write-up, 800 words max** — this is where the judgment gets graded. Cover,
   in this order: double-booking prevention (the four layers and why the DB constraint is the
   real guarantee), doctor leave conflict handling, the slot hold mechanism and TTL choice,
   notification failure handling (outbox, backoff, dead-letter), and **one section on what you
   would do differently with more time or a paid tier** — naming your own tradeoffs is a
   seniority signal. Include the concurrency test result as evidence.

---

## §10 Definition of done
- [ ] 50-way concurrent booking test: exactly 1 success, 49 clean 409s, 1 DB row.
- [ ] Booking succeeds end-to-end with the LLM provider unreachable.
- [ ] Booking succeeds end-to-end with the email provider unreachable (event retries, then
      dead-letters visibly).
- [ ] Leave-with-conflicts flow: preview → cancel → calendar events deleted → patients emailed
      with rebooking links.
- [ ] Expired hold is reaped and the slot returns to availability.
- [ ] Reschedule updates both calendar events; cancel deletes both.
- [ ] A patient cannot read or mutate another patient's appointment (test asserts 403).
- [ ] Medication reminders fire on schedule from a real prescription.
- [ ] Lighthouse accessibility ≥ 95 on the three main screens.
- [ ] `git clone && cp .env.example .env && npm i && npm run db:push && npm run seed && npm run dev`
      works on a clean machine.
- [ ] Write-up is under 800 words and every claim in it is backed by something in the repo.
