import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { addDaysToDateString, localDateOf, slotStartUtc } from "@/lib/clinic-time";

const DOSE_WINDOW_START_MIN = 8 * 60; // 08:00
const DOSE_WINDOW_END_MIN = 22 * 60; // 22:00
const DEFAULT_SINGLE_DOSE_MIN = 9 * 60; // 09:00

/** Evenly spaced clock times across the waking day for N doses/day. 1x/day gets a single morning slot rather than sitting at the window edge. */
function doseTimesOfDay(timesPerDay: number): number[] {
  if (timesPerDay <= 1) return [DEFAULT_SINGLE_DOSE_MIN];
  const span = DOSE_WINDOW_END_MIN - DOSE_WINDOW_START_MIN;
  const step = span / (timesPerDay - 1);
  return Array.from({ length: timesPerDay }, (_, i) => Math.round(DOSE_WINDOW_START_MIN + step * i));
}

export interface ReminderRowInput {
  type: "MEDICATION_REMINDER";
  payload: { prescriptionItemId: string; correlationId?: string };
  nextAttemptAt: Date;
  correlationId?: string;
}

/**
 * Pure computation, no DB access — one row per dose window. Not a cron that
 * re-derives the schedule on every tick (the spec §3); called once, at
 * prescription-save time. Starts the same clinic-local day the prescription
 * is written; a dose time earlier in the day than "now" still gets a row
 * (due immediately), matching "N doses/day for M days = N*M rows" exactly
 * rather than silently dropping the first day's early doses. Takes the
 * already-created item directly (not a re-fetch by id) so the caller can
 * generate these rows inside the same transaction that created the item.
 */
export function computeReminderRows(
  item: { id: string; timesPerDay: number; durationDays: number },
  correlationId?: string
): ReminderRowInput[] {
  const startDateStr = localDateOf(new Date());
  const doseMinutes = doseTimesOfDay(item.timesPerDay);

  const rows: ReminderRowInput[] = [];
  for (let day = 0; day < item.durationDays; day++) {
    const dateStr = addDaysToDateString(startDateStr, day);
    for (const minute of doseMinutes) {
      rows.push({
        type: "MEDICATION_REMINDER",
        payload: { prescriptionItemId: item.id, correlationId },
        nextAttemptAt: slotStartUtc(dateStr, minute),
        correlationId,
      });
    }
  }
  return rows;
}

export interface MedicationReminderRow {
  id: string;
  status: string;
  dueAt: Date;
}

/** For the patient's "my medication reminders" view. */
export async function listMedicationReminders(
  patientId: string,
  prescriptionItemId: string
): Promise<MedicationReminderRow[]> {
  const item = await prisma.prescriptionItem.findUnique({
    where: { id: prescriptionItemId },
    include: { prescription: true },
  });
  if (!item || item.prescription.patientId !== patientId) {
    throw new AppError("NOT_FOUND", "Prescription item not found");
  }

  const events = await prisma.outboxEvent.findMany({
    where: { type: "MEDICATION_REMINDER", payload: { path: ["prescriptionItemId"], equals: prescriptionItemId } },
    orderBy: { nextAttemptAt: "asc" },
  });
  return events.map((e) => ({ id: e.id, status: e.status, dueAt: e.nextAttemptAt }));
}

/** Patient stops their reminder schedule — cancels every not-yet-sent reminder for this medication. */
export async function stopMedicationReminders(patientId: string, prescriptionItemId: string): Promise<number> {
  const item = await prisma.prescriptionItem.findUnique({
    where: { id: prescriptionItemId },
    include: { prescription: true },
  });
  if (!item || item.prescription.patientId !== patientId) {
    throw new AppError("NOT_FOUND", "Prescription item not found");
  }

  const result = await prisma.outboxEvent.updateMany({
    where: {
      type: "MEDICATION_REMINDER",
      status: "PENDING",
      payload: { path: ["prescriptionItemId"], equals: prescriptionItemId },
    },
    data: { status: "CANCELLED" },
  });
  return result.count;
}
