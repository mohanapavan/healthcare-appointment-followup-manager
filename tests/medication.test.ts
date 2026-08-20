import { afterAll, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn().mockResolvedValue({ providerMessageId: "mocked-message-id" });
vi.mock("@/lib/email", () => ({ getEmailProvider: () => ({ send: sendMock }) }));

import { prisma } from "@/lib/prisma";
import { computeReminderRows, listMedicationReminders, stopMedicationReminders } from "@/services/medication";
import { completeVisit } from "@/services/visit";
import { holdSlot, confirmBooking } from "@/services/booking";
import { drainOutbox } from "@/services/outbox";
import { createDoctor, createPatient, setWorkingHours, cleanup } from "./helpers";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

const FUTURE_DATE = "2027-07-12";
const FUTURE_DAY_OF_WEEK = new Date(`${FUTURE_DATE}T12:00:00Z`).getUTCDay();

describe("medication reminder scheduling", () => {
  const doctorIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanup({ doctorProfileIds: doctorIds, userIds });
    await prisma.$disconnect();
  });

  it("generates exactly timesPerDay * durationDays rows, evenly spaced through the day", () => {
    const rows = computeReminderRows({ id: "item-1", timesPerDay: 3, durationDays: 5 });
    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.type === "MEDICATION_REMINDER")).toBe(true);
    expect(rows.every((r) => r.payload.prescriptionItemId === "item-1")).toBe(true);

    // First day's three doses: 08:00, 15:00, 22:00 clinic-local (APP_TIMEZONE=UTC in this env).
    const firstDayTimes = rows.slice(0, 3).map((r) => r.nextAttemptAt.toISOString().slice(11, 16));
    expect(firstDayTimes).toEqual(["08:00", "15:00", "22:00"]);

    // Each subsequent day starts exactly 24h after the corresponding dose the day before.
    const day1First = rows[0].nextAttemptAt.getTime();
    const day2First = rows[3].nextAttemptAt.getTime();
    expect(day2First - day1First).toBe(24 * 60 * 60 * 1000);
  });

  it("gives a single daily dose a sensible morning time rather than the window edge", () => {
    const rows = computeReminderRows({ id: "item-2", timesPerDay: 1, durationDays: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].nextAttemptAt.toISOString().slice(11, 16)).toBe("09:00");
  });

  it("schedules reminders automatically when a doctor completes a visit with a prescription", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, new Date(`${FUTURE_DATE}T10:00:00.000Z`));
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "sore throat", undefined);

    const doctorUser = await prisma.user.findUniqueOrThrow({ where: { id: doctor.userId } });
    const prescription = await completeVisit(doctorUser.id, booking.id, "Bacterial infection, antibiotics prescribed.", [
      { medicationName: "Amoxicillin 500mg", dosage: "1 capsule", timesPerDay: 3, durationDays: 5 },
      { medicationName: "Ibuprofen 200mg", dosage: "1 tablet", timesPerDay: 2, durationDays: 3 },
    ]);

    const items = await prisma.prescriptionItem.findMany({ where: { prescriptionId: prescription.id } });
    expect(items).toHaveLength(2);

    for (const item of items) {
      const expectedCount = item.timesPerDay * item.durationDays;
      const reminders = await listMedicationReminders(patient.id, item.id);
      expect(reminders).toHaveLength(expectedCount);
      expect(reminders.every((r) => r.status === "PENDING")).toBe(true);
    }
  });

  it("lets a patient stop their remaining reminders, leaving already-sent ones untouched", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, new Date(`${FUTURE_DATE}T11:00:00.000Z`));
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "checkup", undefined);
    const doctorUser = await prisma.user.findUniqueOrThrow({ where: { id: doctor.userId } });
    const prescription = await completeVisit(doctorUser.id, booking.id, "Notes", [
      { medicationName: "Paracetamol 500mg", dosage: "1 tablet", timesPerDay: 2, durationDays: 4 },
    ]);
    const item = await prisma.prescriptionItem.findFirstOrThrow({ where: { prescriptionId: prescription.id } });

    // Simulate one dose already having been sent by the worker.
    const allReminders = await prisma.outboxEvent.findMany({
      where: { type: "MEDICATION_REMINDER", payload: { path: ["prescriptionItemId"], equals: item.id } },
      orderBy: { nextAttemptAt: "asc" },
    });
    await prisma.outboxEvent.update({ where: { id: allReminders[0].id }, data: { status: "SENT" } });

    const cancelledCount = await stopMedicationReminders(patient.id, item.id);
    expect(cancelledCount).toBe(allReminders.length - 1);

    const reminders = await listMedicationReminders(patient.id, item.id);
    expect(reminders.filter((r) => r.status === "CANCELLED")).toHaveLength(allReminders.length - 1);
    expect(reminders.filter((r) => r.status === "SENT")).toHaveLength(1);
  });

  it("refuses to show or stop another patient's medication reminders", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const owner = await createPatient();
    const intruder = await createPatient();
    userIds.push(owner.id, intruder.id);

    const held = await holdSlot(owner.id, doctor.id, new Date(`${FUTURE_DATE}T12:00:00.000Z`));
    const { booking } = await confirmBooking(owner.id, held.holdToken!, "checkup", undefined);
    const doctorUser = await prisma.user.findUniqueOrThrow({ where: { id: doctor.userId } });
    const prescription = await completeVisit(doctorUser.id, booking.id, "Notes", [
      { medicationName: "Med", dosage: "1", timesPerDay: 1, durationDays: 1 },
    ]);
    const item = await prisma.prescriptionItem.findFirstOrThrow({ where: { prescriptionId: prescription.id } });

    await expect(listMedicationReminders(intruder.id, item.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stopMedicationReminders(intruder.id, item.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("actually dispatches a due medication reminder as a real email send", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, new Date(`${FUTURE_DATE}T13:00:00.000Z`));
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "checkup", undefined);
    const doctorUser = await prisma.user.findUniqueOrThrow({ where: { id: doctor.userId } });
    const prescription = await completeVisit(doctorUser.id, booking.id, "Notes", [
      { medicationName: "Azithromycin 250mg", dosage: "1 tablet", timesPerDay: 1, durationDays: 1 },
    ]);
    const item = await prisma.prescriptionItem.findFirstOrThrow({ where: { prescriptionId: prescription.id } });

    sendMock.mockClear();
    await prisma.outboxEvent.updateMany({
      where: { type: "MEDICATION_REMINDER", payload: { path: ["prescriptionItemId"], equals: item.id } },
      data: { nextAttemptAt: new Date() },
    });

    await drainOutbox(500);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: patient.email, subject: expect.stringContaining("Azithromycin 250mg") })
    );
    const reminders = await listMedicationReminders(patient.id, item.id);
    expect(reminders.every((r) => r.status === "SENT")).toBe(true);
  });
});
