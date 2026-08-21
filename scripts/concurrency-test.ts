/**
 * The concurrency proof the spec §1 asks for: fires 50 simultaneous
 * POST /api/slots/hold requests at the exact same doctor + slot, through
 * the real HTTP API (not a direct service-function call), and asserts
 * exactly 1 succeeds (201) and 49 come back 409 SLOT_TAKEN, with exactly 1
 * row in the database for that slot.
 *
 * All 50 requests are made as the same seeded patient — the partial unique
 * index is keyed on (doctorProfileId, startsAt) only, not patientId, so
 * this exercises exactly the same race the constraint exists to prevent,
 * without needing 50 throwaway accounts.
 *
 * Requires the app to be running (`npm run dev`, or set CONCURRENCY_TEST_URL
 * to a deployed URL) and DATABASE_URL to point at that same database.
 *
 * Usage: npm run concurrency-test
 */
import { encode } from "@auth/core/jwt";
import { prisma } from "../src/lib/prisma";

const APP_URL = process.env.CONCURRENCY_TEST_URL ?? "http://localhost:3000";
const CONCURRENCY = 50;

async function sessionCookieFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await encode({
    salt: "authjs.session-token",
    secret: process.env.NEXTAUTH_SECRET!,
    token: { sub: user.id, role: user.role, name: user.name, email: user.email },
  });
  return `authjs.session-token=${token}`;
}

/** Walks forward day by day to find the next slot the doctor actually works. */
async function findAFutureWorkingSlot(doctorProfileId: string) {
  for (let daysAhead = 1; daysAhead <= 30; daysAhead++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    const dayOfWeek = d.getUTCDay();
    const hours = await prisma.workingHours.findUnique({
      where: { doctorProfileId_dayOfWeek: { doctorProfileId, dayOfWeek } },
    });
    if (!hours) continue;
    const dateStr = d.toISOString().slice(0, 10);
    const startsAt = new Date(
      `${dateStr}T${String(Math.floor(hours.startMinute / 60)).padStart(2, "0")}:${String(
        hours.startMinute % 60
      ).padStart(2, "0")}:00.000Z`
    );
    const onLeave = await prisma.leave.findFirst({
      where: {
        doctorProfileId,
        startDate: { lte: new Date(`${dateStr}T00:00:00Z`) },
        endDate: { gte: new Date(`${dateStr}T00:00:00Z`) },
      },
    });
    if (onLeave) continue;
    return startsAt;
  }
  throw new Error("Could not find a future working slot in the next 30 days");
}

async function main() {
  const lines: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  log(`=== Concurrency proof: ${CONCURRENCY} simultaneous holds for one slot ===`);
  log(`Run at: ${new Date().toISOString()}`);
  log(`Target: ${APP_URL}`);

  const doctor = await prisma.doctorProfile.findFirst({ include: { user: true } });
  const patient = await prisma.user.findFirst({ where: { role: "PATIENT" } });
  if (!doctor || !patient) {
    throw new Error("Seed data required: run `npm run seed` first.");
  }

  const startsAt = await findAFutureWorkingSlot(doctor.id);
  log(`Doctor: ${doctor.user.name} (${doctor.id})`);
  log(`Patient: ${patient.email} (${patient.id})`);
  log(`Slot: ${startsAt.toISOString()}`);

  // Clean slate: remove anything already occupying this slot from a
  // previous run.
  await prisma.booking.deleteMany({ where: { doctorProfileId: doctor.id, startsAt } });

  const cookie = await sessionCookieFor(patient.id);

  const requests = Array.from({ length: CONCURRENCY }, () =>
    fetch(`${APP_URL}/api/slots/hold`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ doctorProfileId: doctor.id, startsAt: startsAt.toISOString() }),
    })
  );

  const started = Date.now();
  const responses = await Promise.all(requests);
  const elapsedMs = Date.now() - started;

  const statusCounts = new Map<number, number>();
  for (const res of responses) {
    statusCounts.set(res.status, (statusCounts.get(res.status) ?? 0) + 1);
  }

  const succeeded = statusCounts.get(201) ?? 0;
  const conflicted = statusCounts.get(409) ?? 0;
  const other = CONCURRENCY - succeeded - conflicted;

  log(`\nFired ${CONCURRENCY} concurrent requests in ${elapsedMs}ms.`);
  log(`  201 Created:     ${succeeded}`);
  log(`  409 Conflict:    ${conflicted}`);
  log(`  other:           ${other}`);

  const rows = await prisma.booking.findMany({
    where: { doctorProfileId: doctor.id, startsAt },
  });
  log(`\nRows in the database for this slot: ${rows.length}`);
  for (const row of rows) {
    log(`  id=${row.id} status=${row.status} patientId=${row.patientId}`);
  }

  const ok = succeeded === 1 && conflicted === CONCURRENCY - 1 && rows.length === 1;
  log(`\nResult: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) {
    log(
      `Expected exactly 1x 201, ${CONCURRENCY - 1}x 409, and 1 DB row. ` +
        `Got ${succeeded}x 201, ${conflicted}x 409, ${rows.length} row(s).`
    );
  }

  // Leave the DB clean for the next run.
  await prisma.booking.deleteMany({ where: { doctorProfileId: doctor.id, startsAt } });

  const fs = await import("fs");
  const path = await import("path");
  const outDir = path.join(__dirname, "..", "docs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "concurrency-output.txt"), lines.join("\n") + "\n");
  log(`\nSaved to docs/concurrency-output.txt`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
