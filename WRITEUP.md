# System design write-up

## Double-booking prevention

The guarantee is a database constraint, not application logic: a partial
unique index, `UNIQUE (doctorProfileId, startsAt) WHERE status IN ('HELD',
'CONFIRMED')`. Application code — a transaction, a lock, a check-then-insert
— can always race under enough concurrency; a constraint the database
itself enforces cannot. Everything else in the booking path exists to make
*failure cheap*, not to *be* the guarantee:

1. **The constraint** (above) is the real guarantee. Cancelled/completed/
   no-show rows fall outside the predicate, so a freed slot is immediately
   bookable again without a cleanup job.
2. **An advisory lock**, `pg_advisory_xact_lock(hashtext(doctorId||startsAt))`,
   taken before the insert. This is purely a performance choice: without it,
   N concurrent requests for one slot all hit Postgres and N-1 fail with a
   constraint violation, which works but wastes N-1 round trips and fills
   logs with expected errors. With it, requests for the *same* slot
   serialize — the first commits, the rest see the row already exists and
   fail fast. Read-only checks (leave, working hours) run before the lock is
   taken, to keep the serialized section short under contention.
3. **A two-phase hold.** `POST /api/slots/hold` inserts a `HELD` row with a
   5-minute `holdExpiresAt` and returns a token; `POST /api/appointments`
   converts it to `CONFIRMED`. Five minutes is long enough to fill a symptom
   form without feeling rushed, short enough that an abandoned hold doesn't
   meaningfully reduce availability. Expired holds are reaped inline (the
   exact slot, inside the hold transaction, defensive against reaper lag)
   and by the cron tick (all of them).
4. **Idempotency**, both explicit (`Idempotency-Key` header, replays the
   original result) and implicit (the hold token itself — confirming an
   already-`CONFIRMED` hold returns that booking rather than erroring),
   so a network retry or double-submit can't create two bookings.

**Proof**: `scripts/concurrency-test.ts` fires 50 real, concurrent HTTP
`POST /api/slots/hold` requests at one slot against a production build.
Result: `1x 201, 49x 409, 1 row in the database` (full transcript in
`docs/concurrency-output.txt`). The 49 losers each got the next three
available slots in their response body — a conflict is a recovery path, not
a dead end.

## Doctor leave — conflict handling

Marking leave is a conflict-resolution flow, not a delete. `POST
/api/doctors/:id/leave/preview` is a dry run: it returns exactly which
`HELD`/`CONFIRMED` bookings a proposed range would affect, with nothing
written, so the admin/doctor sees "3 appointments affected" and who before
committing. Confirming runs one transaction: the `Leave` row is created,
every affected booking moves to `CANCELLED_BY_CLINIC` with a reason (never
hard-deleted — history and an audit trail survive), and a
`BOOKING_CANCELLATION` + `CALENDAR_DELETE` outbox event is queued per
booking. The cancellation email includes that patient's specific appointment
and the doctor's next three real available slots, computed live. Overlapping
leave ranges are rejected by the same "constraint is the real guarantee"
philosophy — a `btree_gist` exclusion constraint, not just an application
check.

## Notification reliability — the outbox

Email/calendar/AI-generation are never called inline in a request handler —
that loses the message on a crash and blocks the response on a third
party's latency. The domain write and the `OutboxEvent` insert happen in the
same transaction, so a booking can never exist without its jobs queued. A
worker (`POST /api/jobs/tick`, cron-driven) claims due rows with `SELECT ...
FOR UPDATE SKIP LOCKED` — safe against two overlapping cron runs — and
retries failures with backoff (1m, 5m, 25m, 2h, 12h, ±20% jitter). After 5
attempts, `FAILED`: visible on the admin dead-letter view with a manual
retry, never silent. Proven with a mocked dead SMTP host: the booking still
succeeds, the event retries with growing delays, then dead-letters
(`tests/outbox.test.ts`) — and, separately, proven against a real Ethereal
inbox that both patient and doctor actually receive mail.

## What I'd do differently with more time or a paid tier

**A real job queue** (or at minimum Postgres `LISTEN/NOTIFY`) instead of a
once-a-minute cron tick — the free-tier constraint means a confirmed booking
can wait up to 60s for its email, which is fine for a demo and wrong for a
real clinic. **Atomic reschedule** as its own endpoint (currently: cancel,
then rebook — functionally equivalent but two audit-log entries instead of
one, and two calendar round-trips instead of an update). **A distributed
circuit breaker check with less DB chatter** — it's DB-backed correctly for
serverless cold starts, but a Redis-backed version would avoid a query on
every single LLM call. **Real Google OAuth verification** — I built and
tested the full flow against a mocked provider (no Google Cloud project
credentials available in this environment to verify live), and would want a
recorded demo against a real account before calling that phase done.
**Per-doctor working-hours exceptions** (a single extra clinic day, not a
multi-day leave) — currently modeled only as leave ranges or the weekly
recurring schedule, nothing in between.
