import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Exclusion-constraint violations (Postgres 23P01) come back from Prisma as
 * PrismaClientUnknownRequestError, not the PrismaClientKnownRequestError /
 * P2002 shape a *unique*-index violation gets — Prisma's known-error table
 * doesn't include 23P01. Verified empirically against the actual
 * "leave_no_overlap_excl" constraint before writing this, not assumed.
 */
function isLeaveOverlapViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientUnknownRequestError && err.message.includes("leave_no_overlap_excl")
  );
}

function endOfDayExclusive(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function findAffectedBookings(tx: Prisma.TransactionClient | typeof prisma, doctorProfileId: string, startDate: Date, endDate: Date) {
  return tx.booking.findMany({
    where: {
      doctorProfileId,
      status: { in: ["HELD", "CONFIRMED"] },
      startsAt: { gte: startDate, lt: endOfDayExclusive(endDate) },
    },
    include: { patient: true },
    orderBy: { startsAt: "asc" },
  });
}

/** Dry-run: what would marking this range as leave affect? Shown to the admin/doctor before they confirm (the spec §2). */
export async function previewLeaveImpact(doctorProfileId: string, startDate: Date, endDate: Date) {
  return findAffectedBookings(prisma, doctorProfileId, startDate, endDate);
}

export interface CreateLeaveResult {
  leaveId: string;
  cancelledBookingIds: string[];
}

/**
 * Creates the leave and, in the same transaction, cancels every affected
 * booking (never a hard delete — status change with a reason, so history
 * and an audit trail survive) and enqueues its cancellation email +
 * calendar-delete as outbox events. A booking can never end up cancelled
 * without its notification queued, same rule as booking confirmation.
 */
export async function createLeaveWithCancellations(
  doctorProfileId: string,
  startDate: Date,
  endDate: Date,
  reason: string,
  actorUserId: string,
  correlationId?: string
): Promise<CreateLeaveResult> {
  if (endDate < startDate) {
    throw new AppError("VALIDATION_ERROR", "endDate must be on or after startDate.");
  }

  return prisma.$transaction(async (tx) => {
    let leave;
    try {
      leave = await tx.leave.create({ data: { doctorProfileId, startDate, endDate, reason } });
    } catch (err) {
      if (isLeaveOverlapViolation(err)) {
        throw new AppError("LEAVE_OVERLAP", "This leave range overlaps an existing one for this doctor.");
      }
      throw err;
    }

    const affected = await findAffectedBookings(tx, doctorProfileId, startDate, endDate);

    for (const booking of affected) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED_BY_CLINIC", cancelReason: reason, cancelledAt: new Date() },
      });
      await tx.outboxEvent.createMany({
        data: [
          {
            type: "BOOKING_CANCELLATION",
            payload: { bookingId: booking.id, reason, correlationId },
            correlationId,
          },
          { type: "CALENDAR_DELETE", payload: { bookingId: booking.id, correlationId }, correlationId },
        ],
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        action: "LEAVE_CREATED",
        entity: "Leave",
        entityId: leave.id,
        after: {
          doctorProfileId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason,
          cancelledBookingIds: affected.map((b) => b.id),
        },
      },
    });

    logger.info("leave created with cancellations", {
      correlationId,
      leaveId: leave.id,
      doctorProfileId,
      cancelledCount: affected.length,
    });

    return { leaveId: leave.id, cancelledBookingIds: affected.map((b) => b.id) };
  });
}

export async function deleteLeave(leaveId: string, doctorProfileId: string): Promise<void> {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } });
  if (!leave || leave.doctorProfileId !== doctorProfileId) {
    throw new AppError("NOT_FOUND", "Leave not found");
  }
  await prisma.leave.delete({ where: { id: leaveId } });
}

export async function listLeave(doctorProfileId: string) {
  return prisma.leave.findMany({ where: { doctorProfileId }, orderBy: { startDate: "asc" } });
}
