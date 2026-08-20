import { afterAll, describe, expect, it, vi } from "vitest";

// Simulates the email provider being fully unreachable ("point the key at a
// dead host" — CLAUDE.md §3 check). Declared before any @/services/outbox
// import so the mock is in place when that module resolves its own import.
vi.mock("@/lib/email", () => ({
  getEmailProvider: () => ({
    send: async () => {
      throw new Error("connect ECONNREFUSED dead-host:587");
    },
  }),
}));

import { prisma } from "@/lib/prisma";
import { confirmBooking, holdSlot } from "@/services/booking";
import { drainOutbox } from "@/services/outbox";
import { createDoctor, createPatient, setWorkingHours, cleanup } from "./helpers";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

const FUTURE_DATE = "2027-04-05";
const FUTURE_DAY_OF_WEEK = new Date(`${FUTURE_DATE}T12:00:00Z`).getUTCDay();

describe("outbox reliability", () => {
  const doctorIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanup({ doctorProfileIds: doctorIds, userIds });
    await prisma.$disconnect();
  });

  it("confirms a booking even though its email will fail every time (LLM/email never on the critical path)", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, new Date(`${FUTURE_DATE}T09:00:00.000Z`));
    const { booking, replay } = await confirmBooking(patient.id, held.holdToken!, "fever", undefined);

    expect(replay).toBe(false);
    expect(booking.status).toBe("CONFIRMED");
  });

  it("retries a failing outbox event with growing backoff, then dead-letters it after 5 attempts", async () => {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, new Date(`${FUTURE_DATE}T10:00:00.000Z`));
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "cough", undefined);

    const created = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: "BOOKING_CONFIRMATION", payload: { path: ["bookingId"], equals: booking.id } },
    });
    expect(created.status).toBe("PENDING");
    expect(created.attempts).toBe(0);

    const observedDelaysMin: number[] = [];
    let event = created;
    for (let attempt = 0; attempt < 5; attempt++) {
      // Force it due now instead of waiting out the real backoff delay. A
      // large limit guarantees THIS row gets claimed even if other tests
      // left older-but-still-due rows sitting in the shared queue — claim
      // order is by nextAttemptAt, so a just-touched row sorts last.
      await prisma.outboxEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date() } });
      const before = Date.now();
      await drainOutbox(500);
      event = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
      if (event.status === "PENDING") {
        observedDelaysMin.push((event.nextAttemptAt.getTime() - before) / 60_000);
      }
    }

    expect(event.status).toBe("FAILED");
    expect(event.attempts).toBe(5);
    expect(event.lastError).toContain("ECONNREFUSED");

    // 1m, 5m, 25m, 2h nominal backoff (jittered +/-20%) — strictly increasing.
    expect(observedDelaysMin).toHaveLength(4);
    for (let i = 1; i < observedDelaysMin.length; i++) {
      expect(observedDelaysMin[i]).toBeGreaterThan(observedDelaysMin[i - 1]);
    }

    // Dead-lettered events are what the admin view lists for manual retry.
    const deadLettered = await prisma.outboxEvent.findMany({ where: { status: "FAILED", id: event.id } });
    expect(deadLettered).toHaveLength(1);
  });
});
