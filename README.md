# Healthcare Appointment & Follow-up Manager

A clinic booking platform with separate patient, doctor, and admin portals:
symptom-aware booking with a hard double-booking guarantee, AI pre-visit and
post-visit summaries with deterministic fallback, doctor leave with a
conflict-resolution flow, and email + Google Calendar sync driven by a
transactional outbox. See [`CLAUDE.md`](./CLAUDE.md) for the full spec this
was built against and [`PLAN.md`](./PLAN.md) for the build order.

> **Status:** in progress. This README is updated at the end of every phase
> in `PLAN.md`, so it always reflects what's actually implemented, not the
> eventual target. See the checklist below.

## Build status

- [x] Phase 0 — Foundations (Next.js 15, Postgres+Prisma, Auth.js, error
      envelope, structured logging, Vitest wired to a real test DB)
- [x] Phase 1 — Schema, migrations, DB-level constraints, seed data
- [x] Phase 2 — Availability + booking core (slot hold, idempotency, the
      50-way concurrency proof)
- [ ] Phase 3 — Outbox + email reliability
- [ ] Phase 4 — LLM layer (pre-visit / post-visit, fallback, circuit breaker)
- [ ] Phase 5 — Doctor leave conflict flow
- [ ] Phase 6 — Google Calendar
- [ ] Phase 7 — Medication reminders
- [ ] Phase 8 — Frontend (three portals)
- [ ] Phase 9 — Deploy + final docs

## Quick start

Requires Node.js 20+, Docker Desktop, and npm.

```bash
git clone <repo-url> hospital
cd hospital
cp .env.example .env      # generate real secrets for NEXTAUTH_SECRET,
                           # CRON_SECRET, TOKEN_ENCRYPTION_KEY — see below
docker compose up -d      # Postgres for dev (5432) + test (5433)
npm install
npm run db:push           # applies migrations, incl. the hand-written SQL
                           # constraints in prisma/migrations/*/migration.sql
npm run seed               # 1 admin, 4 doctors, 6 patients, demo data
npm run dev
```

`npm run db:push` runs `prisma migrate deploy`, not `prisma db push` —
`db push` only syncs the declarative parts of `schema.prisma` and would
silently skip the hand-written partial unique index and exclusion
constraint in the migration's raw SQL, which is what actually prevents
double-booking (see [§ Double-booking prevention](#double-booking-prevention)
below). The script is named `db:push` anyway so the literal command from a
typical setup checklist still works.

Generate the three secrets `.env.example` calls out:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it three times for `NEXTAUTH_SECRET`, `CRON_SECRET`, and
`TOKEN_ENCRYPTION_KEY`.

### What works with zero extra setup

Email (Ethereal), the LLM layer (deterministic fallback), and Google
Calendar (disabled state) all have safe defaults — the app is fully
functional with only the two `DATABASE_URL`s set. Add `GEMINI_API_KEY`,
`RESEND_API_KEY`, or the `GOOGLE_CLIENT_*` pair later for the real
integrations; nothing else changes. See `.env.example` for what each
variable does.

### Demo accounts

| Role    | Email                   | Password     |
|---------|-------------------------|--------------|
| Admin   | admin@clinic.test       | `Admin123!`  |
| Doctor  | dr.nair@clinic.test     | `Doctor123!` | Cardiology
| Doctor  | dr.kapoor@clinic.test   | `Doctor123!` | Dermatology
| Doctor  | dr.khan@clinic.test     | `Doctor123!` | Pediatrics
| Doctor  | dr.rao@clinic.test      | `Doctor123!` | Orthopedics
| Patient | patient1@clinic.test .. patient6@clinic.test | `Patient123!` |

### Tests

```bash
npm test               # Vitest, against the port-5433 test DB — never the dev DB
npm run concurrency-test   # the 50-way double-booking proof (Phase 2)
```

## Database schema

```mermaid
erDiagram
    User ||--o| DoctorProfile : "is a"
    User ||--o{ Booking : "books (as patient)"
    User ||--o{ CalendarLink : owns
    User ||--o| GoogleCalendarAccount : connects
    User ||--o{ AuditLog : "acts as"

    DoctorProfile ||--o{ WorkingHours : has
    DoctorProfile ||--o{ Leave : takes
    DoctorProfile ||--o{ Booking : "is booked for"
    DoctorProfile ||--o{ Prescription : writes

    Booking ||--o| SymptomSubmission : "pre-visit form"
    Booking ||--o| Prescription : "post-visit"
    Booking ||--o{ CalendarLink : "synced as"

    Prescription ||--o{ PrescriptionItem : contains

    User {
        string id PK
        string email UK
        string passwordHash
        string role "PATIENT | DOCTOR | ADMIN"
    }
    DoctorProfile {
        string id PK
        string userId FK
        string specialisation
        int slotDurationMins
    }
    WorkingHours {
        string id PK
        string doctorProfileId FK
        int dayOfWeek "0-6"
        int startMinute
        int endMinute
    }
    Leave {
        string id PK
        string doctorProfileId FK
        date startDate
        date endDate
        string reason
    }
    Booking {
        string id PK
        string patientId FK
        string doctorProfileId FK
        string status "HELD|CONFIRMED|COMPLETED|CANCELLED_BY_PATIENT|CANCELLED_BY_CLINIC|NO_SHOW"
        timestamptz startsAt
        timestamptz endsAt
        string holdToken UK "nullable"
        timestamptz holdExpiresAt "nullable"
        string idempotencyKey "nullable, unique per patient"
        string correlationId
    }
    SymptomSubmission {
        string id PK
        string bookingId FK
        string symptomText
    }
    AiGeneration {
        string id PK
        string entityType "BOOKING_PRE_VISIT | PRESCRIPTION_POST_VISIT"
        string entityId "polymorphic, no FK — audit log"
        string source "LLM | FALLBACK"
        json parsedOutput
    }
    Prescription {
        string id PK
        string bookingId FK
        string clinicalNotes
    }
    PrescriptionItem {
        string id PK
        string prescriptionId FK
        string medicationName
        int timesPerDay
        int durationDays
    }
    OutboxEvent {
        string id PK
        string type
        string status "PENDING|PROCESSING|SENT|FAILED|CANCELLED"
        int attempts
        timestamptz nextAttemptAt
    }
    CalendarLink {
        string id PK
        string bookingId FK
        string ownerUserId FK
        string externalEventId "nullable"
        string status "ACTIVE | BROKEN"
    }
    GoogleCalendarAccount {
        string id PK
        string userId FK
        string encryptedRefreshToken
        string status "ACTIVE | BROKEN"
    }
    AuditLog {
        string id PK
        string actorId FK "nullable"
        string action
        string entity
        string entityId
    }
```

`AiGeneration` is intentionally not drawn with a foreign key to `Booking` or
`Prescription` — it is a polymorphic, append-only audit table
(`entityType` + `entityId`), not a live relation. See `prisma/schema.prisma`
for the full field list and every index.

### Double-booking prevention

The database, not application code, is the source of truth:

```sql
CREATE UNIQUE INDEX "booking_doctor_active_slot_uidx"
  ON "Booking" ("doctorProfileId", "startsAt")
  WHERE "status" IN ('HELD', 'CONFIRMED');
```

A partial unique index — cancelled/completed/no-show rows don't hold the
slot, so it's immediately bookable again, but no two `HELD`/`CONFIRMED` rows
can ever exist for the same doctor at the same instant, no matter how the
application code races. Proof (direct `psql`, bypassing the app entirely):

```
$ docker exec -i hospital-db-1 psql -U hospital -d hospital
-- first CONFIRMED insert for doctor X at 2026-12-01 09:00 UTC
INSERT INTO "Booking" (...) VALUES (..., 'CONFIRMED', '2026-12-01 09:00:00+00', ...);
INSERT 0 1
-- second CONFIRMED insert, same doctor, same slot, different patient
INSERT INTO "Booking" (...) VALUES (..., 'CONFIRMED', '2026-12-01 09:00:00+00', ...);
ERROR:  duplicate key value violates unique constraint "booking_doctor_active_slot_uidx"
DETAIL:  Key ("doctorProfileId", "startsAt")=(ab1a018d-..., 2026-12-01 09:00:00) already exists.

SELECT count(*) FROM "Booking" WHERE "doctorProfileId" = '...' AND "startsAt" = '2026-12-01 09:00:00+00';
 rows_for_this_slot
--------------------
                  1
```

Full transcript: [`docs/db-constraint-proof.txt`](./docs/db-constraint-proof.txt).
The same is true of `Leave` date ranges, via a `btree_gist` exclusion
constraint (`prisma/migrations/*/migration.sql`) — overlapping leave for one
doctor is rejected by Postgres, not just checked in a service.

### The four-layer booking strategy

1. **DB constraint** — the partial unique index above. The real guarantee;
   everything else exists to make failure cheap and recoverable rather than
   to *be* the guarantee.
2. **Transaction + advisory lock.** `holdSlot()` (`src/services/booking.ts`)
   takes `pg_advisory_xact_lock(hashtext(doctorId || startsAt))` before
   inserting, so concurrent requests for the *same* slot serialize instead
   of racing — one insert succeeds, the rest see the row already exists and
   fail fast, instead of all 50 hitting Postgres and 49 throwing. A Prisma
   `P2002` (unique violation) is caught and turned into `409 SLOT_TAKEN` with
   the next three available slots in the body, so a conflict is a recovery
   path, not a dead end. Read-only checks (leave, working hours) run *before*
   the lock is taken, to keep the serialized section as short as possible
   under contention.
3. **Slot hold with 5-minute TTL.** `POST /api/slots/hold` creates a `HELD`
   row and returns a `holdToken`; `POST /api/appointments` converts it to
   `CONFIRMED`. Expired holds are reaped both inline (defensively, inside
   `holdSlot`, for the exact slot being requested) and by `POST /api/jobs/tick`
   (all of them, for holds nobody ever retries).
4. **Idempotency.** `POST /api/appointments` accepts an `Idempotency-Key`
   header; a repeat with the same key replays the original result. The hold
   token itself is also a natural idempotency key — replaying the exact same
   confirm call is safe even without the header.

### Concurrency proof

`scripts/concurrency-test.ts` fires 50 real, concurrent `POST /api/slots/hold`
HTTP requests (not direct function calls) at one doctor + slot, against a
production build (`npm run build && npm start`), as one seeded patient — the
partial unique index is keyed on `(doctorProfileId, startsAt)` only, so this
is exactly the race the constraint exists to prevent, without needing 50
throwaway accounts. Run it yourself:

```bash
npm run build && npm start   # separate terminal
npm run concurrency-test
```

Result ([full output](./docs/concurrency-output.txt)):

```
Fired 50 concurrent requests in 31012ms.
  201 Created:     1
  409 Conflict:    49
  other:           0

Rows in the database for this slot: 1
  id=dd36c8c4-1e5b-42e3-a2bc-f0705760c29e status=HELD patientId=1857dc5b-392a-4394-b93c-ff81663e99b9

Result: PASS
```

Exactly 1 success, 49 clean conflicts, 1 database row. Note: this deliberately
adversarial case (50 requests for the literal same slot at the literal same
instant) needed a widened Prisma transaction `maxWait`/`timeout` and a larger
Postgres connection pool (see `.env.example`) — defaults are tuned for normal
traffic, not that scenario. The correctness guarantee (the DB constraint)
does not depend on this tuning; only how fast the 49 losers each hear "no"
does.

## API

Documented as each phase adds routes.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET`/`POST` | `/api/auth/[...nextauth]` | — | Auth.js credentials sign-in |
| `GET` | `/api/health` | none | Liveness + DB connectivity check |
| `GET` | `/api/doctors?specialisation=` | any signed-in user | List/search doctors |
| `GET` | `/api/doctors/:id/availability?date=YYYY-MM-DD` | any signed-in user | Computed open slots |
| `POST` | `/api/slots/hold` | PATIENT | `{ doctorProfileId, startsAt }` → `{ holdToken, holdExpiresAt, ... }`, `409 SLOT_TAKEN` on conflict |
| `POST` | `/api/appointments` | PATIENT | `{ holdToken, symptomText }` + optional `Idempotency-Key` header → confirms a hold |
| `POST` | `/api/jobs/tick` | `Authorization: Bearer $CRON_SECRET` | Reaps expired holds (outbox draining lands in Phase 3) |

Every route uses one error envelope: `{ error: { code, message, details? } }`
(`src/lib/errors.ts`) with stable codes (`SLOT_TAKEN`, `HOLD_EXPIRED`,
`HOLD_NOT_FOUND`, `DOCTOR_ON_LEAVE`, `ILLEGAL_STATE_TRANSITION`, `VALIDATION_ERROR`,
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `LLM_UNAVAILABLE`, `RATE_LIMITED`,
`INTERNAL_ERROR`). Every response carries `x-correlation-id`. Layering is
route → service → repository: business rules live in `src/services/*` and
are unit-tested without HTTP (`tests/booking.test.ts`); route handlers only
parse input (Zod), call a service, and map the result to a response.
