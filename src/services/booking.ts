import { Prisma, type Booking } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { addMinutes, dayOfWeekOf, localDateOf, localMinuteOfDay } from "@/lib/clinic-time";
import { findNextAvailableSlots } from "./availability";

const HOLD_TTL_MINUTES = 5;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

/**
 * Two-phase booking, phase one. Layers, in order: an advisory lock scoped to
 * this exact (doctor, slot) so concurrent requests for the SAME slot
 * serialize instead of racing (cheap — they queue briefly rather than all
 * hitting the DB and mostly failing); an inline reap of this slot's own
 * expired hold, defensive against reaper-cron lag; then the insert, whose
 * real backstop is the partial unique index — if two transactions somehow
 * both got this far (e.g. advisory lock hash collision), the DB, not this
 * code, is what makes only one succeed.
 */
export async function holdSlot(
  patientId: string,
  doctorProfileId: string,
  startsAt: Date,
  correlationId?: string
): Promise<Booking> {
  if (startsAt.getTime() <= Date.now()) {
    throw new AppError("VALIDATION_ERROR", "Cannot book a slot in the past.");
  }

  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorProfileId } });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  const endsAt = addMinutes(startsAt, doctor.slotDurationMins);
  const lockKey = `${doctorProfileId}:${startsAt.toISOString()}`;

  // Leave/working-hours are read-only checks that don't participate in the
  // race the lock below protects against (two requests for the same slot) —
  // done up front, outside the lock, so the serialized section is as short
  // as possible under heavy contention for one slot. The tiny TOCTOU window
  // this leaves (leave gets added a moment after this check passes) isn't
  // the guarantee this code is responsible for; the partial unique index is
  // what actually prevents double-booking, unconditionally.
  const localDateStr = localDateOf(startsAt);
  const dateOnly = new Date(`${localDateStr}T00:00:00Z`);
  const onLeave = await prisma.leave.findFirst({
    where: { doctorProfileId, startDate: { lte: dateOnly }, endDate: { gte: dateOnly } },
  });
  if (onLeave) {
    throw new AppError("DOCTOR_ON_LEAVE", "The doctor is on leave that day.");
  }

  const dayOfWeek = dayOfWeekOf(localDateStr);
  const hours = await prisma.workingHours.findUnique({
    where: { doctorProfileId_dayOfWeek: { doctorProfileId, dayOfWeek } },
  });
  const startMinute = localMinuteOfDay(startsAt);
  if (!hours || startMinute < hours.startMinute || startMinute + doctor.slotDurationMins > hours.endMinute) {
    throw new AppError("VALIDATION_ERROR", "That time is outside the doctor's working hours.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

    // Defensive reap: don't let an unreaped expired hold block this slot.
    await tx.booking.updateMany({
      where: {
        doctorProfileId,
        startsAt,
        status: "HELD",
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });

    try {
      const booking = await tx.booking.create({
        data: {
          patientId,
          doctorProfileId,
          status: "HELD",
          startsAt,
          endsAt,
          holdToken: crypto.randomUUID(),
          holdExpiresAt: addMinutes(new Date(), HOLD_TTL_MINUTES),
          ...(correlationId ? { correlationId } : {}),
        },
      });
      logger.info("slot held", { correlationId, bookingId: booking.id, doctorProfileId, startsAt });
      return booking;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const nextAvailable = await findNextAvailableSlots(doctorProfileId, startsAt, 3);
        throw new AppError("SLOT_TAKEN", "That slot was just taken. Here are three others.", {
          nextAvailable,
        });
      }
      throw err;
    }
  }, {
    // Defaults (2s maxWait / 5s timeout) are tuned for normal traffic, not
    // dozens of requests genuinely queuing on the same advisory lock at
    // once (see docs/concurrency-output.txt) — widened so that burst
    // resolves into clean 201/409s instead of Prisma's pool-wait error.
    maxWait: 30000,
    timeout: 15000,
  });
}

export interface ConfirmResult {
  booking: Booking;
  replay: boolean;
}

/**
 * Two-phase booking, phase two: converts a HELD row into CONFIRMED. Safe
 * against retries two ways: an explicit `Idempotency-Key` (checked first,
 * so a retry with no hold token left works), and the hold token itself
 * acting as a natural idempotency key (a retry of the exact same confirm
 * call, hold token included, returns the same booking rather than erroring).
 * The domain write and the outbox inserts happen in one transaction: a
 * booking can never exist without its confirmation email/calendar/AI-summary
 * jobs queued, and vice versa (CLAUDE.md §3).
 */
export async function confirmBooking(
  patientId: string,
  holdToken: string,
  symptomText: string,
  idempotencyKey: string | undefined,
  correlationId?: string
): Promise<ConfirmResult> {
  if (idempotencyKey) {
    const existing = await prisma.booking.findUnique({
      where: { patientId_idempotencyKey: { patientId, idempotencyKey } },
    });
    if (existing) return { booking: existing, replay: true };
  }

  // Validated outside the transaction below on purpose: throwing inside an
  // interactive `$transaction` callback rolls back everything it did,
  // including the very EXPIRED write we want to keep when the hold has
  // lapsed. The final update still re-checks status="HELD" for the race
  // window between this check and that write.
  const hold = await prisma.booking.findUnique({ where: { holdToken } });
  if (!hold || hold.patientId !== patientId) {
    throw new AppError("HOLD_NOT_FOUND", "This hold does not exist or has already been used.");
  }
  if (hold.status === "CONFIRMED") {
    return { booking: hold, replay: true };
  }
  if (hold.status !== "HELD") {
    throw new AppError("ILLEGAL_STATE_TRANSITION", `Cannot confirm a booking in status ${hold.status}.`);
  }
  if (!hold.holdExpiresAt || hold.holdExpiresAt < new Date()) {
    await prisma.booking.update({ where: { id: hold.id }, data: { status: "EXPIRED" } });
    throw new AppError("HOLD_EXPIRED", "This hold has expired. Please pick a slot again.");
  }

  return prisma.$transaction(async (tx) => {
    let updated: Booking;
    try {
      updated = await tx.booking.update({
        where: { id: hold.id, status: "HELD" },
        data: { status: "CONFIRMED", idempotencyKey: idempotencyKey ?? null },
      });
    } catch (err) {
      if (isUniqueViolation(err) && idempotencyKey) {
        const existing = await tx.booking.findUnique({
          where: { patientId_idempotencyKey: { patientId, idempotencyKey } },
        });
        if (existing) return { booking: existing, replay: true };
      }
      if (isRecordNotFound(err)) {
        // Lost a race with another confirm/expiry of this same hold since
        // the check above.
        const latest = await tx.booking.findUnique({ where: { id: hold.id } });
        if (latest?.status === "CONFIRMED") return { booking: latest, replay: true };
        throw new AppError(
          "ILLEGAL_STATE_TRANSITION",
          `Cannot confirm a booking in status ${latest?.status ?? "UNKNOWN"}.`
        );
      }
      throw err;
    }

    await tx.symptomSubmission.create({
      data: { bookingId: updated.id, patientId, symptomText },
    });

    const payloadBase = { bookingId: updated.id, correlationId };
    await tx.outboxEvent.createMany({
      data: [
        { type: "BOOKING_CONFIRMATION", payload: payloadBase, correlationId },
        { type: "CALENDAR_CREATE", payload: payloadBase, correlationId },
        { type: "AI_PRE_VISIT_GENERATION", payload: payloadBase, correlationId },
      ],
    });

    logger.info("booking confirmed", { correlationId, bookingId: updated.id });
    return { booking: updated, replay: false };
  });
}

/**
 * Patient-initiated cancel. Same rule as every other status change: never a
 * hard delete, and the domain write + its outbox events (email, calendar
 * delete) commit together (CLAUDE.md §3). Reuses the exact same
 * BOOKING_CANCELLATION/CALENDAR_DELETE dispatchers the leave-conflict flow
 * uses — cancellation has one code path regardless of who initiated it.
 */
export async function cancelBooking(
  patientId: string,
  bookingId: string,
  reason: string,
  correlationId?: string
): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.patientId !== patientId) {
      throw new AppError("NOT_FOUND", "Appointment not found");
    }
    if (booking.status !== "HELD" && booking.status !== "CONFIRMED") {
      throw new AppError(
        "ILLEGAL_STATE_TRANSITION",
        `Cannot cancel a booking in status ${booking.status}.`
      );
    }

    const wasConfirmed = booking.status === "CONFIRMED";
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED_BY_PATIENT", cancelReason: reason, cancelledAt: new Date() },
    });

    // A HELD-only booking never had confirmation email/calendar events
    // queued in the first place — nothing to notify or delete.
    if (wasConfirmed) {
      const payloadBase = { bookingId: updated.id, reason, correlationId };
      await tx.outboxEvent.createMany({
        data: [
          { type: "BOOKING_CANCELLATION", payload: payloadBase, correlationId },
          { type: "CALENDAR_DELETE", payload: payloadBase, correlationId },
        ],
      });
    }

    logger.info("booking cancelled by patient", { correlationId, bookingId: updated.id });
    return updated;
  });
}
