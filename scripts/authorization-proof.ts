/**
 * CLAUDE.md hard rule #5: "A patient hitting a doctor's endpoint by ID must
 * get 403, and there must be a test for it." tests/authorization.test.ts
 * covers the service-layer ownership checks; this proves the HTTP layer
 * (requireRole()/requireAdminOrOwningDoctor() actually gating the route)
 * against the real running app — auth()'s request-context dependency means
 * that layer can't be exercised by calling the route handler function
 * directly in a unit test, only over real HTTP.
 *
 * Usage: npm run dev (separate terminal), then npm run authorization-proof
 */
import { encode } from "@auth/core/jwt";
import { prisma } from "../src/lib/prisma";

const APP_URL = process.env.AUTH_PROOF_URL ?? "http://localhost:3000";

async function sessionCookieFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await encode({
    salt: "authjs.session-token",
    secret: process.env.NEXTAUTH_SECRET!,
    token: { sub: user.id, role: user.role, name: user.name, email: user.email },
  });
  return { cookie: `authjs.session-token=${token}`, user };
}

async function main() {
  const lines: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  log(`=== Authorization proof: a patient hitting doctor/admin-only endpoints ===`);
  log(`Run at: ${new Date().toISOString()}`);

  const doctor = await prisma.doctorProfile.findFirstOrThrow();
  const booking = await prisma.booking.findFirstOrThrow({ where: { doctorProfileId: doctor.id } });
  const patient = await prisma.user.findFirstOrThrow({ where: { role: "PATIENT" } });
  const { cookie } = await sessionCookieFor(patient.id);

  log(`Patient: ${patient.email} (${patient.id})`);
  log(`Target doctor profile: ${doctor.id}`);
  log(`Target booking: ${booking.id}\n`);

  let allPass = true;

  const cases: { name: string; method: string; path: string; body?: unknown }[] = [
    {
      name: "PATIENT completes a doctor's appointment",
      method: "POST",
      path: `/api/appointments/${booking.id}/complete`,
      body: { clinicalNotes: "should be rejected", prescriptionItems: [] },
    },
    {
      name: "PATIENT creates leave for a doctor",
      method: "POST",
      path: `/api/doctors/${doctor.id}/leave`,
      body: { startDate: "2030-01-01", endDate: "2030-01-02", reason: "should be rejected" },
    },
    {
      name: "PATIENT views the admin outbox dead-letter list",
      method: "GET",
      path: `/api/admin/outbox`,
    },
    {
      name: "PATIENT creates a doctor account",
      method: "POST",
      path: `/api/doctors`,
      body: { email: "x@x.com", password: "x", name: "x", specialisation: "x" },
    },
  ];

  for (const c of cases) {
    const res = await fetch(`${APP_URL}${c.path}`, {
      method: c.method,
      headers: { "content-type": "application/json", cookie },
      body: c.body ? JSON.stringify(c.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    const pass = res.status === 403 && data?.error?.code === "FORBIDDEN";
    allPass &&= pass;
    log(
      `${pass ? "PASS" : "FAIL"}  ${c.method} ${c.path} -> ${res.status} ${data?.error?.code ?? "(no error code)"}  [${c.name}]`
    );
  }

  log(`\nResult: ${allPass ? "PASS" : "FAIL"} — every doctor/admin-only route rejected the patient with 403 FORBIDDEN.`);

  const fs = await import("fs");
  const path = await import("path");
  const outDir = path.join(__dirname, "..", "docs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "authorization-proof.txt"), lines.join("\n") + "\n");
  log(`\nSaved to docs/authorization-proof.txt`);

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
