import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { completeVisit } from "@/services/visit";
import { cancelBooking, confirmBooking, holdSlot } from "@/services/booking";
import { createDoctor, createPatient, setWorkingHours, cleanup } from "./helpers";

/**
 * CLAUDE.md hard rule #5: "A patient hitting a doctor's endpoint by ID must
 * get 403, and there must be a test for it." Server-side authorization,
 * checked here at the service layer (the layer these rules actually live
 * in — route handlers just call requireRole()/requireAdminOrOwningDoctor()
 * first, which is exercised live over real HTTP in
 * docs/authorization-proof.txt since that layer can't be unit tested
 * without a running request context for next-auth's auth()).
 */
if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

const FUTURE_DATE = "2027-08-09";
const FUTURE_DAY_OF_WEEK = new Date(`${FUTURE_DATE}T12:00:00Z`).getUTCDay();

describe("server-side authorization — ownership, not just role", () => {
  const doctorIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanup({ doctorProfileIds: doctorIds, userIds });
    await prisma.$disconnect();
  });

  it("a different doctor cannot complete another doctor's appointment (403-equivalent FORBIDDEN)", async () => {
    const doctorA = await createDoctor({ slotDurationMins: 30 });
    const doctorB = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctorA.id, doctorB.id);
    userIds.push(doctorA.userId, doctorB.userId);
    await setWorkingHours(doctorA.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctorA.id, new Date(`${FUTURE_DATE}T09:00:00.000Z`));
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "checkup", undefined);

    await expect(
      completeVisit(doctorB.userId, booking.id, "unauthorized notes", [])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The booking itself must be untouched by the rejected attempt.
    const reloaded = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(reloaded.status).toBe("CONFIRMED");
  });

  it("a patient (not a doctor at all) hitting the doctor-only complete-visit path gets FORBIDDEN, not a crash", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    const intruderPatient = await createPatient();
    userIds.push(patient.id, intruderPatient.id);

    const held = await holdSlot(patient.id, doctor.id, new Date(`${FUTURE_DATE}T10:00:00.000Z`));
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "checkup", undefined);

    // intruderPatient.id is a PATIENT's user id, not any doctor's — simulates
    // a patient reaching this code path by ID.
    await expect(
      completeVisit(intruderPatient.id, booking.id, "should not be allowed", [])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cancelling another patient's booking returns NOT_FOUND (not FORBIDDEN) so a booking ID can't be enumerated", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const owner = await createPatient();
    const intruder = await createPatient();
    userIds.push(owner.id, intruder.id);

    const held = await holdSlot(owner.id, doctor.id, new Date(`${FUTURE_DATE}T11:00:00.000Z`));
    const { booking } = await confirmBooking(owner.id, held.holdToken!, "checkup", undefined);

    await expect(cancelBooking(intruder.id, booking.id, "not mine to cancel")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const reloaded = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(reloaded.status).toBe("CONFIRMED");
  });
});
