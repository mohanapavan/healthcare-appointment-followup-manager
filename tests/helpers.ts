import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export async function createUser(role: Role, namePrefix = "Test") {
  return prisma.user.create({
    data: {
      email: `${namePrefix.toLowerCase()}-${crypto.randomUUID()}@example.com`,
      passwordHash: "x",
      name: `${namePrefix} ${role}`,
      role,
    },
  });
}

export async function createDoctor(opts: { specialisation?: string; slotDurationMins?: number } = {}) {
  const user = await createUser("DOCTOR", "Dr");
  return prisma.doctorProfile.create({
    data: {
      userId: user.id,
      specialisation: opts.specialisation ?? "General",
      slotDurationMins: opts.slotDurationMins ?? 30,
    },
  });
}

export async function setWorkingHours(
  doctorProfileId: string,
  dayOfWeek: number,
  startMinute = 9 * 60,
  endMinute = 17 * 60
) {
  return prisma.workingHours.create({ data: { doctorProfileId, dayOfWeek, startMinute, endMinute } });
}

export function createPatient() {
  return createUser("PATIENT", "Patient");
}

/**
 * Deletes everything a test created, given the ids it tracked — including
 * any outbox rows those bookings queued. Tests share one real Postgres test
 * DB and drainOutbox() legitimately claims *any* due row (that's correct
 * production behaviour), so a test that creates outbox rows and never
 * drains them pollutes the shared queue for a later test/file that expects
 * to claim its own row promptly (ORDER BY nextAttemptAt means older
 * leftover rows crowd out a freshly-touched one).
 */
export async function cleanup(opts: { doctorProfileIds?: string[]; userIds?: string[] }) {
  const { doctorProfileIds = [], userIds = [] } = opts;
  if (doctorProfileIds.length) {
    const bookings = await prisma.booking.findMany({
      where: { doctorProfileId: { in: doctorProfileIds } },
      select: { id: true },
    });
    if (bookings.length) {
      await prisma.outboxEvent.deleteMany({
        where: { OR: bookings.map((b) => ({ payload: { path: ["bookingId"], equals: b.id } })) },
      });
    }
    await prisma.booking.deleteMany({ where: { doctorProfileId: { in: doctorProfileIds } } });
    await prisma.leave.deleteMany({ where: { doctorProfileId: { in: doctorProfileIds } } });
    await prisma.workingHours.deleteMany({ where: { doctorProfileId: { in: doctorProfileIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: doctorProfileIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
