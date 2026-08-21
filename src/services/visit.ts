import { Prescription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { computeReminderRows } from "./medication";

export interface PrescriptionItemInput {
  medicationName: string;
  dosage: string;
  timesPerDay: number;
  durationDays: number;
  instructions?: string;
}

/**
 * Doctor submits post-visit notes + prescription. Moves the booking to
 * COMPLETED and, in the same transaction: enqueues the post-visit AI
 * summary and every medication reminder for every item — same "domain
 * write and outbox insert together" rule as booking confirmation
 * (the spec §3).
 */
export async function completeVisit(
  doctorUserId: string,
  bookingId: string,
  clinicalNotes: string,
  items: PrescriptionItemInput[],
  correlationId?: string
): Promise<Prescription> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { doctorProfile: true },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Appointment not found");
  if (booking.doctorProfile.userId !== doctorUserId) {
    throw new AppError("FORBIDDEN", "You do not have access to this appointment");
  }
  if (booking.status !== "CONFIRMED") {
    throw new AppError(
      "ILLEGAL_STATE_TRANSITION",
      `Cannot complete a visit for a booking in status ${booking.status}.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } });

    const prescription = await tx.prescription.create({
      data: {
        bookingId: booking.id,
        doctorProfileId: booking.doctorProfileId,
        patientId: booking.patientId,
        clinicalNotes,
        items: { create: items },
      },
      include: { items: true },
    });

    await tx.outboxEvent.create({
      data: {
        type: "AI_POST_VISIT_GENERATION",
        payload: { prescriptionId: prescription.id, correlationId },
        correlationId,
      },
    });

    const reminderRows = prescription.items.flatMap((item) => computeReminderRows(item, correlationId));
    if (reminderRows.length > 0) {
      await tx.outboxEvent.createMany({ data: reminderRows });
    }

    logger.info("visit completed", {
      correlationId,
      bookingId: booking.id,
      prescriptionId: prescription.id,
      medicationReminders: reminderRows.length,
    });
    return prescription;
  });
}
