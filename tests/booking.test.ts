import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getAvailability } from "@/services/availability";
import { confirmBooking, holdSlot } from "@/services/booking";
import { createDoctor, createPatient, setWorkingHours, cleanup } from "./helpers";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

// A fixed future date, far enough out that "today" never collides with it.
const FUTURE_DATE = "2027-03-01";
const FUTURE_DAY_OF_WEEK = new Date(`${FUTURE_DATE}T12:00:00Z`).getUTCDay();

function slotAt(hour: number, minute = 0) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${FUTURE_DATE}T${hh}:${mm}:00.000Z`);
}

describe("booking service", () => {
  const doctorIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanup({ doctorProfileIds: doctorIds, userIds });
    await prisma.$disconnect();
  });

  async function setupDoctor() {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    return doctor;
  }

  it("computes availability from working hours, minus leave, minus active bookings", async () => {
    const doctor = await setupDoctor();
    const before = await getAvailability(doctor.id, FUTURE_DATE);
    expect(before.length).toBe(16); // 9:00-17:00 in 30-min slots

    await prisma.leave.create({
      data: {
        doctorProfileId: doctor.id,
        startDate: new Date(`${FUTURE_DATE}T00:00:00Z`),
        endDate: new Date(`${FUTURE_DATE}T00:00:00Z`),
        reason: "Test leave",
      },
    });
    const duringLeave = await getAvailability(doctor.id, FUTURE_DATE);
    expect(duringLeave).toHaveLength(0);

    await prisma.leave.deleteMany({ where: { doctorProfileId: doctor.id } });
    const afterLeaveRemoved = await getAvailability(doctor.id, FUTURE_DATE);
    expect(afterLeaveRemoved.length).toBe(16);
  });

  it("excludes a CONFIRMED slot from availability but not a cancelled one", async () => {
    const doctor = await setupDoctor();
    const patient = await createPatient();
    userIds.push(patient.id);

    const before = await getAvailability(doctor.id, FUTURE_DATE);
    expect(before.some((s) => s.startsAt.getTime() === slotAt(10).getTime())).toBe(true);

    const booking = await prisma.booking.create({
      data: {
        patientId: patient.id,
        doctorProfileId: doctor.id,
        status: "CONFIRMED",
        startsAt: slotAt(10),
        endsAt: slotAt(10, 30),
      },
    });
    const during = await getAvailability(doctor.id, FUTURE_DATE);
    expect(during.some((s) => s.startsAt.getTime() === slotAt(10).getTime())).toBe(false);

    await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED_BY_PATIENT" } });
    const after = await getAvailability(doctor.id, FUTURE_DATE);
    expect(after.some((s) => s.startsAt.getTime() === slotAt(10).getTime())).toBe(true);
  });

  it("rejects a hold for a doctor on leave that day", async () => {
    const doctor = await setupDoctor();
    const patient = await createPatient();
    userIds.push(patient.id);
    await prisma.leave.create({
      data: {
        doctorProfileId: doctor.id,
        startDate: new Date(`${FUTURE_DATE}T00:00:00Z`),
        endDate: new Date(`${FUTURE_DATE}T00:00:00Z`),
        reason: "Test leave",
      },
    });

    await expect(holdSlot(patient.id, doctor.id, slotAt(10))).rejects.toMatchObject({
      code: "DOCTOR_ON_LEAVE",
    });
  });

  it("returns SLOT_TAKEN with three alternatives when a second patient races a held slot", async () => {
    const doctor = await setupDoctor();
    const patientA = await createPatient();
    const patientB = await createPatient();
    userIds.push(patientA.id, patientB.id);

    await holdSlot(patientA.id, doctor.id, slotAt(11));

    const err = await holdSlot(patientB.id, doctor.id, slotAt(11)).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("SLOT_TAKEN");
    expect(Array.isArray((err.details as { nextAvailable: unknown[] }).nextAvailable)).toBe(true);
    expect((err.details as { nextAvailable: unknown[] }).nextAvailable.length).toBeGreaterThan(0);
  });

  it("expires a hold whose TTL has lapsed and rejects confirming it", async () => {
    const doctor = await setupDoctor();
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, slotAt(12));
    // Simulate TTL lapse directly (avoids a real 5-minute sleep in the suite).
    await prisma.booking.update({
      where: { id: held.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      confirmBooking(patient.id, held.holdToken!, "mild headache", undefined)
    ).rejects.toMatchObject({ code: "HOLD_EXPIRED" });

    const reloaded = await prisma.booking.findUnique({ where: { id: held.id } });
    expect(reloaded?.status).toBe("EXPIRED");

    // The slot must be bookable again immediately after expiry.
    const available = await getAvailability(doctor.id, FUTURE_DATE);
    expect(available.some((s) => s.startsAt.getTime() === slotAt(12).getTime())).toBe(true);
  });

  it("confirms a held slot, and a repeat confirm with the same Idempotency-Key replays the result", async () => {
    const doctor = await setupDoctor();
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, slotAt(13));
    const idempotencyKey = crypto.randomUUID();

    const first = await confirmBooking(patient.id, held.holdToken!, "sore throat", idempotencyKey);
    expect(first.replay).toBe(false);
    expect(first.booking.status).toBe("CONFIRMED");

    const second = await confirmBooking(patient.id, held.holdToken!, "sore throat", idempotencyKey);
    expect(second.replay).toBe(true);
    expect(second.booking.id).toBe(first.booking.id);

    const submissions = await prisma.symptomSubmission.findMany({ where: { bookingId: first.booking.id } });
    expect(submissions).toHaveLength(1);

    const outboxRows = await prisma.outboxEvent.findMany({
      where: { payload: { path: ["bookingId"], equals: first.booking.id } },
    });
    expect(outboxRows.map((r) => r.type).sort()).toEqual(
      ["AI_PRE_VISIT_GENERATION", "BOOKING_CONFIRMATION", "CALENDAR_CREATE"].sort()
    );
  });

  it("rejects confirming a booking that is not HELD (illegal transition)", async () => {
    const doctor = await setupDoctor();
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, slotAt(14));
    await prisma.booking.update({ where: { id: held.id }, data: { status: "CANCELLED_BY_PATIENT" } });

    await expect(
      confirmBooking(patient.id, held.holdToken!, "n/a", undefined)
    ).rejects.toMatchObject({ code: "ILLEGAL_STATE_TRANSITION" });
  });
});
