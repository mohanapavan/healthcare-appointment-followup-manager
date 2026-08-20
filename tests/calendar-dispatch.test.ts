import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("@/lib/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calendar")>();
  return {
    ...actual,
    getCalendarProvider: () => mocks,
  };
});

// These tests are about calendar dispatch, not email — mocked so the suite
// isn't making real Ethereal network calls for a concern it isn't testing.
vi.mock("@/lib/email", () => ({
  getEmailProvider: () => ({
    send: async () => ({ providerMessageId: "mocked" }),
  }),
}));

import { prisma } from "@/lib/prisma";
import { InvalidGrantError } from "@/lib/calendar";
import { encryptSecret } from "@/lib/crypto";
import { holdSlot, confirmBooking } from "@/services/booking";
import { drainOutbox } from "@/services/outbox";
import { createDoctor, createPatient, setWorkingHours, cleanup } from "./helpers";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

const FUTURE_DATE = "2027-06-07";
const FUTURE_DAY_OF_WEEK = new Date(`${FUTURE_DATE}T12:00:00Z`).getUTCDay();

async function connectFakeGoogleAccount(userId: string) {
  await prisma.googleCalendarAccount.create({
    data: {
      userId,
      encryptedAccessToken: encryptSecret("fake-access-token"),
      encryptedRefreshToken: encryptSecret("fake-refresh-token"),
      expiryDate: new Date(Date.now() + 3600_000),
      scope: "https://www.googleapis.com/auth/calendar.events",
      status: "ACTIVE",
    },
  });
}

describe("calendar sync outbox dispatch (mocked Google provider — no real OAuth needed)", () => {
  const doctorIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanup({ doctorProfileIds: doctorIds, userIds });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mocks.createEvent.mockReset();
    mocks.updateEvent.mockReset();
    mocks.deleteEvent.mockReset();
  });

  async function bookOne(startsAt: Date) {
    const doctor = await createDoctor({ slotDurationMins: 30 });
    doctorIds.push(doctor.id);
    userIds.push(doctor.userId);
    await setWorkingHours(doctor.id, FUTURE_DAY_OF_WEEK, 9 * 60, 17 * 60);
    const patient = await createPatient();
    userIds.push(patient.id);

    const held = await holdSlot(patient.id, doctor.id, startsAt);
    const { booking } = await confirmBooking(patient.id, held.holdToken!, "checkup", undefined);
    return { doctor, patient, booking };
  }

  it("skips sync (not an error) when neither party has connected Google Calendar", async () => {
    const { booking } = await bookOne(new Date(`${FUTURE_DATE}T09:00:00.000Z`));

    const result = await drainOutbox(500);
    expect(result.deadLettered).toBe(0);
    expect(mocks.createEvent).not.toHaveBeenCalled();

    const links = await prisma.calendarLink.findMany({ where: { bookingId: booking.id } });
    expect(links).toHaveLength(0);
  });

  it("creates a calendar event for a connected patient, skips the unconnected doctor", async () => {
    const { patient, booking } = await bookOne(new Date(`${FUTURE_DATE}T10:00:00.000Z`));
    await connectFakeGoogleAccount(patient.id);
    mocks.createEvent.mockResolvedValue({ externalEventId: "google-event-123" });

    await drainOutbox(500);

    const link = await prisma.calendarLink.findUniqueOrThrow({
      where: { bookingId_ownerUserId: { bookingId: booking.id, ownerUserId: patient.id } },
    });
    expect(link.externalEventId).toBe("google-event-123");
    expect(link.status).toBe("ACTIVE");
    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
  });

  it("does not create a duplicate event on a retried CALENDAR_CREATE dispatch", async () => {
    const { patient, booking } = await bookOne(new Date(`${FUTURE_DATE}T11:00:00.000Z`));
    await connectFakeGoogleAccount(patient.id);
    mocks.createEvent.mockResolvedValue({ externalEventId: "google-event-456" });

    await drainOutbox(500);
    expect(mocks.createEvent).toHaveBeenCalledTimes(1);

    // Simulate the same event being dispatched again (e.g. a crash-recovery reclaim).
    await prisma.outboxEvent.updateMany({
      where: { type: "CALENDAR_CREATE", payload: { path: ["bookingId"], equals: booking.id } },
      data: { status: "PENDING", nextAttemptAt: new Date() },
    });
    await drainOutbox(500);

    expect(mocks.createEvent).toHaveBeenCalledTimes(1); // still just once — idempotent
  });

  it("marks the account BROKEN on invalid_grant, keeps the booking valid, and does not treat it as a retry-worthy failure", async () => {
    const { patient, booking } = await bookOne(new Date(`${FUTURE_DATE}T12:00:00.000Z`));
    await connectFakeGoogleAccount(patient.id);
    mocks.createEvent.mockRejectedValue(new InvalidGrantError("revoked"));

    const result = await drainOutbox(500);
    expect(result.deadLettered).toBe(0);
    expect(result.retried).toBe(0);

    const account = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { userId: patient.id } });
    expect(account.status).toBe("BROKEN");

    const reloadedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(reloadedBooking.status).toBe("CONFIRMED"); // untouched by the calendar failure

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: "CALENDAR_CREATE", payload: { path: ["bookingId"], equals: booking.id } },
    });
    expect(event.status).toBe("SENT");
  });

  it("deletes the calendar event and its CalendarLink on CALENDAR_DELETE", async () => {
    const { patient, booking } = await bookOne(new Date(`${FUTURE_DATE}T13:00:00.000Z`));
    await connectFakeGoogleAccount(patient.id);
    mocks.createEvent.mockResolvedValue({ externalEventId: "google-event-789" });
    await drainOutbox(500);

    mocks.deleteEvent.mockResolvedValue(undefined);
    await prisma.outboxEvent.create({
      data: { type: "CALENDAR_DELETE", payload: { bookingId: booking.id } },
    });
    await drainOutbox(500);

    expect(mocks.deleteEvent).toHaveBeenCalledWith(expect.any(String), "google-event-789");
    const link = await prisma.calendarLink.findUnique({
      where: { bookingId_ownerUserId: { bookingId: booking.id, ownerUserId: patient.id } },
    });
    expect(link).toBeNull();
  });
});
