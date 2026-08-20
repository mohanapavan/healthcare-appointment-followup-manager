import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { holdSlot, confirmBooking } from "@/services/booking";
import { createLeaveWithCancellations, previewLeaveImpact } from "@/services/leave";
import { createDoctor, createPatient, setWorkingHours, cleanup } from "./helpers";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

const FUTURE_DATE = "2027-05-10";
const FUTURE_DAY_OF_WEEK = new Date(`${FUTURE_DATE}T12:00:00Z`).getUTCDay();

function slotAt(hour: number) {
  return new Date(`${FUTURE_DATE}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

describe("doctor leave — conflict resolution flow", () => {
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
    // Also the following day, since one test books a "survivor" appointment
    // there to prove leave doesn't touch bookings outside its range.
    await setWorkingHours(doctor.id, (FUTURE_DAY_OF_WEEK + 1) % 7, 9 * 60, 17 * 60);
    return doctor;
  }

  it("previews exactly the bookings a leave range would affect, and none outside it", async () => {
    const doctor = await setupDoctor();
    const p1 = await createPatient();
    const p2 = await createPatient();
    userIds.push(p1.id, p2.id);

    const bookingInRange = await prisma.booking.create({
      data: { patientId: p1.id, doctorProfileId: doctor.id, status: "CONFIRMED", startsAt: slotAt(10), endsAt: slotAt(10) },
    });
    // Cancelled bookings must not show up as "affected" — they aren't active.
    await prisma.booking.create({
      data: {
        patientId: p2.id,
        doctorProfileId: doctor.id,
        status: "CANCELLED_BY_PATIENT",
        startsAt: slotAt(11),
        endsAt: slotAt(11),
      },
    });

    const affected = await previewLeaveImpact(
      doctor.id,
      new Date(`${FUTURE_DATE}T00:00:00Z`),
      new Date(`${FUTURE_DATE}T00:00:00Z`)
    );

    expect(affected.map((b) => b.id)).toEqual([bookingInRange.id]);
    expect(affected[0].patient.id).toBe(p1.id);
  });

  it("books three slots, marks the day as leave, and cancels + queues notification + calendar-delete for all three — none outside the range", async () => {
    const doctor = await setupDoctor();
    const patients = await Promise.all([createPatient(), createPatient(), createPatient(), createPatient()]);
    userIds.push(...patients.map((p) => p.id));

    const bookingIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const held = await holdSlot(patients[i].id, doctor.id, slotAt(9 + i));
      const { booking } = await confirmBooking(patients[i].id, held.holdToken!, "checkup", undefined);
      bookingIds.push(booking.id);
    }
    // A fourth booking the next day must survive the leave untouched.
    const nextDay = new Date(slotAt(9));
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const survivorHeld = await holdSlot(patients[3].id, doctor.id, nextDay);
    const { booking: survivor } = await confirmBooking(patients[3].id, survivorHeld.holdToken!, "checkup", undefined);

    const result = await createLeaveWithCancellations(
      doctor.id,
      new Date(`${FUTURE_DATE}T00:00:00Z`),
      new Date(`${FUTURE_DATE}T00:00:00Z`),
      "Doctor unavailable — conference",
      patients[0].id // actor id doesn't need to be the doctor for this test
    );

    expect(result.cancelledBookingIds.sort()).toEqual(bookingIds.sort());

    const cancelled = await prisma.booking.findMany({ where: { id: { in: bookingIds } } });
    for (const b of cancelled) {
      expect(b.status).toBe("CANCELLED_BY_CLINIC");
      expect(b.cancelReason).toBe("Doctor unavailable — conference");
      expect(b.cancelledAt).not.toBeNull();
    }

    const survivorReloaded = await prisma.booking.findUniqueOrThrow({ where: { id: survivor.id } });
    expect(survivorReloaded.status).toBe("CONFIRMED");

    for (const bookingId of bookingIds) {
      const events = await prisma.outboxEvent.findMany({
        where: { payload: { path: ["bookingId"], equals: bookingId } },
      });
      const types = events.map((e) => e.type);
      expect(types).toContain("BOOKING_CANCELLATION");
      expect(types).toContain("CALENDAR_DELETE");
    }

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: "Leave", entityId: result.leaveId },
    });
    expect(audit.action).toBe("LEAVE_CREATED");
    expect((audit.after as { cancelledBookingIds: string[] }).cancelledBookingIds.sort()).toEqual(
      bookingIds.sort()
    );
  });

  it("rejects an overlapping leave range for the same doctor", async () => {
    const doctor = await setupDoctor();
    const patient = await createPatient();
    userIds.push(patient.id);

    await createLeaveWithCancellations(
      doctor.id,
      new Date(`${FUTURE_DATE}T00:00:00Z`),
      new Date(`${FUTURE_DATE}T00:00:00Z`),
      "first leave",
      patient.id
    );

    const dayAfter = new Date(`${FUTURE_DATE}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

    await expect(
      createLeaveWithCancellations(doctor.id, new Date(`${FUTURE_DATE}T00:00:00Z`), dayAfter, "overlapping leave", patient.id)
    ).rejects.toMatchObject({ code: "LEAVE_OVERLAP" });
  });
});
