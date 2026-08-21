import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { addMinutes, dayOfWeekOf, isValidDateString, slotStartUtc, toDateOnly } from "@/lib/clinic-time";

export interface AvailableSlot {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Availability is computed on every call, never stored — derived from
 * working hours minus leave minus active (HELD-and-unexpired or CONFIRMED)
 * bookings. A pre-generated slots table would desync the moment a doctor
 * edits their hours (the spec §1).
 */
export async function getAvailability(doctorProfileId: string, dateStr: string): Promise<AvailableSlot[]> {
  if (!isValidDateString(dateStr)) {
    throw new AppError("VALIDATION_ERROR", "date must be YYYY-MM-DD");
  }

  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorProfileId } });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  const dateOnly = new Date(`${dateStr}T00:00:00Z`);
  const onLeave = await prisma.leave.findFirst({
    where: { doctorProfileId, startDate: { lte: dateOnly }, endDate: { gte: dateOnly } },
  });
  if (onLeave) return [];

  const dayOfWeek = dayOfWeekOf(dateStr);
  const hours = await prisma.workingHours.findUnique({
    where: { doctorProfileId_dayOfWeek: { doctorProfileId, dayOfWeek } },
  });
  if (!hours) return [];

  const slotMins = doctor.slotDurationMins;
  const candidates: AvailableSlot[] = [];
  for (let minute = hours.startMinute; minute + slotMins <= hours.endMinute; minute += slotMins) {
    const startsAt = slotStartUtc(dateStr, minute);
    candidates.push({ startsAt, endsAt: addMinutes(startsAt, slotMins) });
  }
  if (candidates.length === 0) return [];

  const dayStart = candidates[0].startsAt;
  const dayEnd = candidates[candidates.length - 1].endsAt;
  const now = new Date();

  const active = await prisma.booking.findMany({
    where: {
      doctorProfileId,
      startsAt: { gte: dayStart, lt: dayEnd },
      OR: [{ status: "CONFIRMED" }, { status: "HELD", holdExpiresAt: { gt: now } }],
    },
    select: { startsAt: true, endsAt: true },
  });

  return candidates.filter(
    (slot) => !active.some((b) => overlaps(slot.startsAt, slot.endsAt, b.startsAt, b.endsAt))
  );
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Used for 409 recovery bodies and leave-cancellation rebooking links. */
export async function findNextAvailableSlots(
  doctorProfileId: string,
  after: Date,
  count: number
): Promise<AvailableSlot[]> {
  const results: AvailableSlot[] = [];
  const cursor = new Date(after);
  for (let day = 0; day < 60 && results.length < count; day++) {
    const dateStr = toDateOnly(cursor);
    const slots = await getAvailability(doctorProfileId, dateStr);
    for (const slot of slots) {
      if (slot.startsAt > after) {
        results.push(slot);
        if (results.length >= count) break;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return results;
}
