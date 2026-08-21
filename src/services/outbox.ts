import { OutboxEvent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { getEmailProvider } from "@/lib/email";
import {
  bookingCancellationEmail,
  bookingConfirmationEmail,
  bookingReminderEmail,
  medicationReminderEmail,
} from "@/lib/email/templates";
import { findNextAvailableSlots } from "./availability";
import { generatePostVisitSummary, generatePreVisitSummary } from "@/lib/llm";
import { getCalendarProvider, InvalidGrantError } from "@/lib/calendar";
import { getActiveRefreshToken, markAccountBroken } from "./calendar-account";

// 1m, 5m, 25m, 2h, 12h — after the 5th failed attempt, dead-letter.
const BACKOFF_MINUTES = [1, 5, 25, 120, 720];
const MAX_ATTEMPTS = 5;
// Types with a real dispatcher below.
const HANDLED_TYPES = [
  "BOOKING_CONFIRMATION",
  "BOOKING_REMINDER",
  "BOOKING_CANCELLATION",
  "MEDICATION_REMINDER",
  "AI_PRE_VISIT_GENERATION",
  "AI_POST_VISIT_GENERATION",
  "CALENDAR_CREATE",
  "CALENDAR_UPDATE",
  "CALENDAR_DELETE",
];
// A row stuck in PROCESSING for more than 5 minutes is assumed to be from a
// worker that crashed mid-dispatch, and is eligible to be reclaimed — see
// the literal "interval '5 minutes'" in claimDueOutboxEvents below.

function backoffDelayMs(attempts: number): number {
  const base = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  const jitter = 0.8 + Math.random() * 0.4; // +/-20%
  return Math.round(base * jitter * 60_000);
}

async function claimDueOutboxEvents(limit: number): Promise<OutboxEvent[]> {
  return prisma.$transaction(async (tx) => {
    // Prisma's tagged-template ${} always becomes a bind parameter — it
    // can't be spliced into the middle of an `interval '...'` string
    // literal that way, so the stuck-processing threshold is a literal
    // here (kept in sync with STUCK_PROCESSING_MINUTES by hand) while the
    // type list uses Prisma.join, which *is* the supported way to
    // parameterize an IN (...) list.
    const due = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM "OutboxEvent"
      WHERE (
        (status = 'PENDING' AND "nextAttemptAt" <= now())
        OR (status = 'PROCESSING' AND "updatedAt" < now() - interval '5 minutes')
      )
      AND type::text IN (${Prisma.join(HANDLED_TYPES)})
      ORDER BY "nextAttemptAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    if (due.length === 0) return [];
    const ids = due.map((r) => r.id);
    await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { status: "PROCESSING" } });
    return tx.outboxEvent.findMany({ where: { id: { in: ids } } });
  });
}

interface BookingPayload {
  bookingId: string;
  correlationId?: string;
}

interface MedicationReminderPayload {
  prescriptionItemId: string;
  correlationId?: string;
}

async function dispatchBookingConfirmation(payload: BookingPayload): Promise<string> {
  const booking = await loadBookingContext(payload.bookingId);
  const provider = getEmailProvider();

  const [patientResult, doctorResult] = await Promise.all([
    provider.send({
      to: booking.patient.email,
      idempotencyKey: `booking-confirm-patient-${booking.id}`,
      ...bookingConfirmationEmail({
        recipientName: booking.patient.name,
        recipientRole: "PATIENT",
        counterpartName: booking.doctorProfile.user.name,
        specialisation: booking.doctorProfile.specialisation,
        startsAt: booking.startsAt,
      }),
    }),
    provider.send({
      to: booking.doctorProfile.user.email,
      idempotencyKey: `booking-confirm-doctor-${booking.id}`,
      ...bookingConfirmationEmail({
        recipientName: booking.doctorProfile.user.name,
        recipientRole: "DOCTOR",
        counterpartName: booking.patient.name,
        specialisation: booking.doctorProfile.specialisation,
        startsAt: booking.startsAt,
      }),
    }),
  ]);

  return `${patientResult.providerMessageId},${doctorResult.providerMessageId}`;
}

async function dispatchBookingReminder(payload: BookingPayload): Promise<string> {
  const booking = await loadBookingContext(payload.bookingId);
  const provider = getEmailProvider();

  const [patientResult, doctorResult] = await Promise.all([
    provider.send({
      to: booking.patient.email,
      idempotencyKey: `booking-reminder-patient-${booking.id}`,
      ...bookingReminderEmail({
        recipientName: booking.patient.name,
        recipientRole: "PATIENT",
        counterpartName: booking.doctorProfile.user.name,
        specialisation: booking.doctorProfile.specialisation,
        startsAt: booking.startsAt,
      }),
    }),
    provider.send({
      to: booking.doctorProfile.user.email,
      idempotencyKey: `booking-reminder-doctor-${booking.id}`,
      ...bookingReminderEmail({
        recipientName: booking.doctorProfile.user.name,
        recipientRole: "DOCTOR",
        counterpartName: booking.patient.name,
        specialisation: booking.doctorProfile.specialisation,
        startsAt: booking.startsAt,
      }),
    }),
  ]);

  return `${patientResult.providerMessageId},${doctorResult.providerMessageId}`;
}

async function dispatchBookingCancellation(
  payload: BookingPayload & { reason?: string }
): Promise<string> {
  const booking = await loadBookingContext(payload.bookingId);
  const provider = getEmailProvider();
  const reason = payload.reason ?? booking.cancelReason ?? "The clinic cancelled this appointment.";

  const alternatives = await findNextAvailableSlots(booking.doctorProfileId, new Date(), 3);
  const rebookingLinks = alternatives.map((slot) => ({
    when: slot.startsAt.toISOString(),
    url: `${getEnv().NEXTAUTH_URL}/patient/book/${booking.doctorProfileId}?slot=${encodeURIComponent(
      slot.startsAt.toISOString()
    )}`,
  }));

  const [patientResult, doctorResult] = await Promise.all([
    provider.send({
      to: booking.patient.email,
      idempotencyKey: `booking-cancel-patient-${booking.id}`,
      ...bookingCancellationEmail({
        recipientName: booking.patient.name,
        recipientRole: "PATIENT",
        counterpartName: booking.doctorProfile.user.name,
        specialisation: booking.doctorProfile.specialisation,
        startsAt: booking.startsAt,
        reason,
        rebookingLinks,
      }),
    }),
    provider.send({
      to: booking.doctorProfile.user.email,
      idempotencyKey: `booking-cancel-doctor-${booking.id}`,
      ...bookingCancellationEmail({
        recipientName: booking.doctorProfile.user.name,
        recipientRole: "DOCTOR",
        counterpartName: booking.patient.name,
        specialisation: booking.doctorProfile.specialisation,
        startsAt: booking.startsAt,
        reason,
      }),
    }),
  ]);

  return `${patientResult.providerMessageId},${doctorResult.providerMessageId}`;
}

async function dispatchMedicationReminder(payload: MedicationReminderPayload): Promise<string> {
  const item = await prisma.prescriptionItem.findUniqueOrThrow({
    where: { id: payload.prescriptionItemId },
    include: { prescription: { include: { booking: { include: { patient: true } } } } },
  });
  const provider = getEmailProvider();
  const patient = item.prescription.booking.patient;

  const result = await provider.send({
    to: patient.email,
    idempotencyKey: `med-reminder-${item.id}`,
    ...medicationReminderEmail({
      patientName: patient.name,
      medicationName: item.medicationName,
      dosage: item.dosage,
      instructions: item.instructions,
    }),
  });
  return result.providerMessageId;
}

async function loadBookingContext(bookingId: string) {
  return prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { patient: true, doctorProfile: { include: { user: true } } },
  });
}

/**
 * The LLM call lives here, dispatched from the outbox worker — never inline
 * in the booking-confirm request handler (the spec hard rule #3). A
 * fallback-sourced result still counts as dispatch success: graceful
 * degradation is the point, not a retry-worthy failure.
 */
async function dispatchAiPreVisitGeneration(payload: BookingPayload): Promise<string> {
  const submission = await prisma.symptomSubmission.findUniqueOrThrow({
    where: { bookingId: payload.bookingId },
  });
  const result = await generatePreVisitSummary(payload.bookingId, submission.symptomText, payload.correlationId);
  return `urgency=${result.urgency}`;
}

async function dispatchAiPostVisitGeneration(payload: {
  prescriptionId: string;
  correlationId?: string;
}): Promise<string> {
  const prescription = await prisma.prescription.findUniqueOrThrow({
    where: { id: payload.prescriptionId },
    include: { items: true },
  });
  await generatePostVisitSummary(
    prescription.id,
    prescription.clinicalNotes,
    prescription.items,
    payload.correlationId
  );
  return `prescription=${prescription.id}`;
}

/**
 * Calendar sync is opt-in per user and never blocks a booking either way:
 * a party with no connected Google account is silently skipped (not an
 * error), and a revoked/expired refresh token (the spec §7) marks the
 * account BROKEN and moves on rather than retrying forever or failing the
 * outbox event. Idempotent against retries via CalendarLink — a create
 * that already has an externalEventId is not repeated (Google's REST API
 * has no client-supplied insert idempotency key of its own to lean on).
 */
async function dispatchCalendarCreate(payload: BookingPayload): Promise<string> {
  const booking = await loadBookingContext(payload.bookingId);
  const provider = getCalendarProvider();
  const owners = [booking.patientId, booking.doctorProfile.userId];
  const results: string[] = [];

  for (const ownerUserId of owners) {
    const existing = await prisma.calendarLink.findUnique({
      where: { bookingId_ownerUserId: { bookingId: booking.id, ownerUserId } },
    });
    if (existing?.externalEventId) {
      results.push(`${ownerUserId}:already-created`);
      continue;
    }

    const refreshToken = await getActiveRefreshToken(ownerUserId);
    if (!refreshToken) {
      results.push(`${ownerUserId}:not-connected`);
      continue;
    }

    try {
      const { externalEventId } = await provider.createEvent(refreshToken, {
        summary: `Appointment: ${booking.patient.name} with Dr. ${booking.doctorProfile.user.name}`,
        description: `${booking.doctorProfile.specialisation} appointment`,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        attendeeEmails: [booking.patient.email, booking.doctorProfile.user.email],
      });
      await prisma.calendarLink.upsert({
        where: { bookingId_ownerUserId: { bookingId: booking.id, ownerUserId } },
        update: { externalEventId, status: "ACTIVE" },
        create: { bookingId: booking.id, ownerUserId, externalEventId, status: "ACTIVE" },
      });
      results.push(`${ownerUserId}:${externalEventId}`);
    } catch (err) {
      if (err instanceof InvalidGrantError) {
        await markAccountBroken(ownerUserId);
        results.push(`${ownerUserId}:broken`);
        continue;
      }
      throw err; // a real failure — let the outbox retry/dead-letter it
    }
  }
  return results.join(",");
}

async function dispatchCalendarUpdate(payload: BookingPayload): Promise<string> {
  const booking = await loadBookingContext(payload.bookingId);
  const provider = getCalendarProvider();
  const links = await prisma.calendarLink.findMany({ where: { bookingId: booking.id, status: "ACTIVE" } });
  const results: string[] = [];

  for (const link of links) {
    if (!link.externalEventId) continue;
    const refreshToken = await getActiveRefreshToken(link.ownerUserId);
    if (!refreshToken) {
      results.push(`${link.ownerUserId}:not-connected`);
      continue;
    }
    try {
      await provider.updateEvent(refreshToken, link.externalEventId, {
        summary: `Appointment: ${booking.patient.name} with Dr. ${booking.doctorProfile.user.name}`,
        description: `${booking.doctorProfile.specialisation} appointment`,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        attendeeEmails: [booking.patient.email, booking.doctorProfile.user.email],
      });
      results.push(`${link.ownerUserId}:updated`);
    } catch (err) {
      if (err instanceof InvalidGrantError) {
        await markAccountBroken(link.ownerUserId);
        results.push(`${link.ownerUserId}:broken`);
        continue;
      }
      throw err;
    }
  }
  return results.join(",") || "no-links";
}

async function dispatchCalendarDelete(payload: BookingPayload): Promise<string> {
  const links = await prisma.calendarLink.findMany({ where: { bookingId: payload.bookingId, status: "ACTIVE" } });
  const provider = getCalendarProvider();
  const results: string[] = [];

  for (const link of links) {
    if (!link.externalEventId) continue;
    const refreshToken = await getActiveRefreshToken(link.ownerUserId);
    if (!refreshToken) {
      results.push(`${link.ownerUserId}:not-connected`);
      continue;
    }
    try {
      await provider.deleteEvent(refreshToken, link.externalEventId);
      await prisma.calendarLink.delete({ where: { id: link.id } });
      results.push(`${link.ownerUserId}:deleted`);
    } catch (err) {
      if (err instanceof InvalidGrantError) {
        await markAccountBroken(link.ownerUserId);
        results.push(`${link.ownerUserId}:broken`);
        continue;
      }
      throw err;
    }
  }
  return results.join(",") || "no-links";
}

async function dispatch(event: OutboxEvent): Promise<string> {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "BOOKING_CONFIRMATION":
      return dispatchBookingConfirmation(payload as unknown as BookingPayload);
    case "BOOKING_REMINDER":
      return dispatchBookingReminder(payload as unknown as BookingPayload);
    case "BOOKING_CANCELLATION":
      return dispatchBookingCancellation(payload as unknown as BookingPayload & { reason?: string });
    case "MEDICATION_REMINDER":
      return dispatchMedicationReminder(payload as unknown as MedicationReminderPayload);
    case "AI_PRE_VISIT_GENERATION":
      return dispatchAiPreVisitGeneration(payload as unknown as BookingPayload);
    case "AI_POST_VISIT_GENERATION":
      return dispatchAiPostVisitGeneration(payload as unknown as { prescriptionId: string; correlationId?: string });
    case "CALENDAR_CREATE":
      return dispatchCalendarCreate(payload as unknown as BookingPayload);
    case "CALENDAR_UPDATE":
      return dispatchCalendarUpdate(payload as unknown as BookingPayload);
    case "CALENDAR_DELETE":
      return dispatchCalendarDelete(payload as unknown as BookingPayload);
    default:
      throw new Error(`No dispatcher for outbox event type ${event.type}`);
  }
}

export interface DrainResult {
  claimed: number;
  sent: number;
  retried: number;
  deadLettered: number;
}

/** Claims due (or crash-stuck) rows and dispatches each. Safe to call from overlapping cron runs — SKIP LOCKED means two ticks never claim the same row. */
export async function drainOutbox(limit = 25): Promise<DrainResult> {
  const claimed = await claimDueOutboxEvents(limit);
  const result: DrainResult = { claimed: claimed.length, sent: 0, retried: 0, deadLettered: 0 };

  for (const event of claimed) {
    try {
      const providerMessageId = await dispatch(event);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "SENT", providerMessageId, lastError: null },
      });
      result.sent++;
    } catch (err) {
      const attempts = event.attempts + 1;
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (attempts >= MAX_ATTEMPTS) {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "FAILED", attempts, lastError: errorMessage },
        });
        result.deadLettered++;
        logger.error("outbox event dead-lettered", {
          outboxEventId: event.id,
          type: event.type,
          attempts,
          error: errorMessage,
        });
      } else {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: "PENDING",
            attempts,
            nextAttemptAt: new Date(Date.now() + backoffDelayMs(attempts)),
            lastError: errorMessage,
          },
        });
        result.retried++;
        logger.warn("outbox event failed, will retry", {
          outboxEventId: event.id,
          type: event.type,
          attempts,
          error: errorMessage,
        });
      }
    }
  }

  return result;
}

/**
 * Scans confirmed upcoming bookings and enqueues a BOOKING_REMINDER outbox
 * row ~24h before the appointment, exactly once per booking.
 */
export async function scheduleUpcomingReminders(): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60_000);

  const candidates = await prisma.booking.findMany({
    where: { status: "CONFIRMED", startsAt: { gte: now, lte: windowEnd } },
    select: { id: true },
  });
  if (candidates.length === 0) return 0;

  const existing = await prisma.outboxEvent.findMany({
    where: { type: "BOOKING_REMINDER" },
    select: { payload: true },
  });
  const alreadyScheduled = new Set(
    existing
      .map((e) => (e.payload as { bookingId?: string } | null)?.bookingId)
      .filter((id): id is string => Boolean(id))
  );

  const toSchedule = candidates.filter((b) => !alreadyScheduled.has(b.id));
  if (toSchedule.length === 0) return 0;

  await prisma.outboxEvent.createMany({
    data: toSchedule.map((b) => ({
      type: "BOOKING_REMINDER" as const,
      payload: { bookingId: b.id },
      nextAttemptAt: now,
    })),
  });
  return toSchedule.length;
}
