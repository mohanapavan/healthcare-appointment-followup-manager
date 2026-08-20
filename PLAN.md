# PLAN.md — build order

Work top to bottom. Do not start a phase until the previous one's checks pass.
After each phase: commit, update `PROGRESS.md` with what changed and what broke.

---

## Phase 0 — Foundations
- [ ] Next.js 15 + TypeScript + Tailwind scaffold, strict mode on, path aliases.
- [ ] Postgres (Neon/Render) connected; Prisma initialised.
- [ ] Auth.js credentials + bcrypt + role in the JWT; `requireRole()` server helper.
- [ ] Error envelope, Zod boundary validation, correlation-ID logging middleware.
- [ ] Vitest wired to a **separate test database**; one smoke test green.
- **Check:** sign up, log in, hit a role-guarded route and get 403 as the wrong role.

## Phase 1 — Schema and domain (do this before any UI)
- [ ] Full Prisma schema per CLAUDE.md §5, including enums and the state machine.
- [ ] Partial unique index on `(doctorId, startsAt)` for HELD/CONFIRMED — write it as a raw
      SQL migration; Prisma cannot express the predicate.
- [ ] Seed script: 1 admin, 4 doctors across specialisations with working hours and one leave
      range, 6 patients, a few past appointments with prescriptions.
- [ ] Mermaid ER diagram committed.
- **Check:** try inserting two CONFIRMED rows for the same doctor+time directly in psql —
      the second must be rejected by the database.

## Phase 2 — Availability + booking core (highest-graded work)
- [ ] `getAvailability(doctorId, date)` computed from working hours − leave − active bookings.
- [ ] `POST /api/slots/hold` — transaction + advisory lock, 5-min TTL, returns hold token.
- [ ] `POST /api/appointments` — converts hold, `Idempotency-Key` support, P2002 → 409 with
      next three slots in the body.
- [ ] Hold reaper in the job tick.
- [ ] `scripts/concurrency-test.ts` — 50 parallel bookings, asserts 1 / 49 / 1 row.
- [ ] Unit tests: availability across a leave boundary, hold expiry, idempotent replay,
      illegal state transitions.
- **Check:** concurrency test green, output saved to `docs/concurrency-output.txt`.

## Phase 3 — Outbox + email
- [ ] `OutboxEvent` table; domain write and outbox insert in the same transaction.
- [ ] `/api/jobs/tick` worker: `FOR UPDATE SKIP LOCKED`, exponential backoff with jitter,
      dead-letter after 5 attempts.
- [ ] Email provider behind an interface; Ethereal locally, Resend in production.
- [ ] Templates: booking confirmation, reminder, cancellation (patient + doctor variants).
- [ ] Admin dead-letter view with manual retry.
- **Check:** point the email key at a dead host — booking still succeeds, event retries with
      growing delays, then dead-letters and appears in the admin view.

## Phase 4 — LLM layer
- [ ] `lib/llm/` — provider interface, Zod output schemas, versioned prompts, deterministic
      fallback summariser, circuit breaker, `AiGeneration` audit rows.
- [ ] Pre-visit: symptoms → urgency / chief complaint / three questions for the doctor.
- [ ] Post-visit: clinical notes → patient-friendly summary + medication schedule + follow-up.
- [ ] Red-flag keyword rules that force High urgency regardless of model output.
- [ ] PII stripped before every call; assert this in a test.
- **Check:** with a dead LLM endpoint, both summaries still render, marked as fallback.

## Phase 5 — Leave conflict flow
- [ ] Leave CRUD with overlap rejection.
- [ ] Affected-appointments preview before confirming.
- [ ] Transactional cancel + calendar delete + outbox notifications with rebooking links.
- **Check:** book three slots, mark that day as leave, confirm all three patients receive a
      mail carrying their own appointment details and three real alternative slots.

## Phase 6 — Google Calendar
- [ ] OAuth 2.0 offline flow, encrypted refresh-token storage, connect/disconnect UI.
- [ ] Create on booking, update on reschedule, delete on cancel — both patient and doctor.
- [ ] `invalid_grant` handling: mark link broken, prompt reconnect, appointment unaffected.
- **Check:** revoke access in Google account settings mid-flow — the app degrades cleanly and
      says exactly what to do.

## Phase 7 — Medication reminders
- [ ] Prescription items with frequency and duration → scheduled outbox rows at save time.
- [ ] Patient can view and stop their reminder schedule.
- **Check:** a 3×/day 5-day prescription generates the right number of correctly-timed rows.

## Phase 8 — Frontend
- [ ] `DESIGN.md` written and self-critiqued **before** any component work (CLAUDE.md §8).
- [ ] Patient portal: search by specialisation → day rail → symptom form → hold with countdown
      → confirm → my appointments.
- [ ] Doctor portal: today's clinic day, pre-visit AI summary per patient, post-visit notes and
      prescription entry, leave request.
- [ ] Admin portal: doctor profiles, working hours, leave, outbox health and dead letters.
- [ ] All states designed: loading, empty, error, AI-fallback, hold-expired, slot-taken.
- **Check:** Lighthouse accessibility ≥ 95; full keyboard-only booking; 375px works.

## Phase 9 — Deploy and document
- [ ] Deploy + hosted Postgres + cron hitting `/api/jobs/tick` every minute.
- [ ] Seed production demo data; demo-reset endpoint.
- [ ] README: 5-minute setup, `.env.example`, API docs, ER diagram, prompts, OAuth steps,
      demo logins, concurrency output.
- [ ] `DESIGN-WRITEUP.md` — 800 words max, structure per CLAUDE.md §9.4. Count the words.
- [ ] Clean the git history's loose ends; final read-through of every file as the grader.
- **Check:** clone into a fresh directory and follow your own README literally. Anything that
      needs a step you didn't write down is a README bug.

---

## If time runs short
Cut in this order — never the reverse:
1. Medication reminders (keep the schema and one working example)
2. Post-visit summary polish
3. Frontend breadth (fewer screens, same quality — never lower the quality floor)

Never cut: the concurrency proof, the outbox, the LLM fallback, or the write-up.
