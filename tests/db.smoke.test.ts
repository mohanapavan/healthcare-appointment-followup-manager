import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

// Guards against ever running destructive/integration tests against the
// real dev database because someone forgot `dotenv -e .env.test`.
if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error(
    "Refusing to run tests: DATABASE_URL does not point at hospital_test. " +
      "Run tests via `npm test` (loads .env.test) not `vitest` directly."
  );
}

describe("database connectivity", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to the test database and can round-trip a row", async () => {
    const user = await prisma.user.create({
      data: {
        email: `smoke-${Date.now()}@example.com`,
        passwordHash: "not-a-real-hash",
        name: "Smoke Test",
        role: "PATIENT",
      },
    });

    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe(user.email);

    await prisma.user.delete({ where: { id: user.id } });
  });

  it("enforces the partial unique index against double booking", async () => {
    const doctor = await createTestDoctor();
    const patientA = await createTestPatient();
    const patientB = await createTestPatient();
    const startsAt = new Date("2026-09-01T09:00:00.000Z");
    const endsAt = new Date("2026-09-01T09:30:00.000Z");

    await prisma.booking.create({
      data: {
        patientId: patientA.id,
        doctorProfileId: doctor.id,
        status: "CONFIRMED",
        startsAt,
        endsAt,
      },
    });

    await expect(
      prisma.booking.create({
        data: {
          patientId: patientB.id,
          doctorProfileId: doctor.id,
          status: "CONFIRMED",
          startsAt,
          endsAt,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.booking.deleteMany({ where: { doctorProfileId: doctor.id } });
    await prisma.doctorProfile.delete({ where: { id: doctor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [doctor.userId, patientA.id, patientB.id] } } });
  });
});

async function createTestDoctor() {
  const user = await prisma.user.create({
    data: {
      email: `doc-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
      name: "Dr. Smoke",
      role: "DOCTOR",
    },
  });
  return prisma.doctorProfile.create({
    data: { userId: user.id, specialisation: "General", slotDurationMins: 30 },
  });
}

async function createTestPatient() {
  return prisma.user.create({
    data: {
      email: `pat-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
      name: "Patient Smoke",
      role: "PATIENT",
    },
  });
}
