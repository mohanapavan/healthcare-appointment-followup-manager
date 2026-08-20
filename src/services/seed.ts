/**
 * Seeds one admin, four doctors (distinct specialisations, Mon-Fri working
 * hours), six patients, one leave range, and a few completed past
 * appointments with prescriptions — enough to exercise every portal without
 * an empty-state on first login. Idempotent: safe to re-run (upserts by
 * email; skips past-appointment rows it already created).
 *
 * Shared between `prisma/seed.ts` (CLI, `npm run seed`) and
 * `POST /api/demo/reset` (so a grader can reset the hosted demo without
 * shell access) — kept in one place so the two never drift apart.
 */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { addDaysToDateString, addMinutes, localDateOf, slotStartUtc } from "@/lib/clinic-time";

export const DEMO_PASSWORD = {
  admin: "Admin123!",
  doctor: "Doctor123!",
  patient: "Patient123!",
};

const WORKDAY_START_MIN = 9 * 60; // 09:00
const WORKDAY_END_MIN = 17 * 60; // 17:00

async function upsertUser(prisma: PrismaClient, email: string, name: string, role: Role, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash },
  });
}

/**
 * Deletes every row this app owns, in FK-safe order, but leaves the schema
 * itself alone. Used by the demo-reset endpoint before re-seeding — a
 * hosted grading demo needs a real "start over" button, not just "add more
 * on top of whatever state I left it in."
 */
export async function wipeAllData(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.aiGeneration.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.calendarLink.deleteMany();
  await prisma.googleCalendarAccount.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.symptomSubmission.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.aiCircuitBreaker.deleteMany();
}

export async function runSeed(prisma: PrismaClient): Promise<string[]> {
  const log: string[] = [];
  const say = (s: string) => log.push(s);

  say("Seeding admin...");
  await upsertUser(prisma, "admin@clinic.test", "Priya Sharma", Role.ADMIN, DEMO_PASSWORD.admin);

  say("Seeding doctors...");
  const doctorDefs = [
    { email: "dr.nair@clinic.test", name: "Meera Nair", specialisation: "Cardiology" },
    { email: "dr.kapoor@clinic.test", name: "Rohan Kapoor", specialisation: "Dermatology" },
    { email: "dr.khan@clinic.test", name: "Ayesha Khan", specialisation: "Pediatrics" },
    { email: "dr.rao@clinic.test", name: "Vikram Rao", specialisation: "Orthopedics" },
  ];

  const doctorProfiles = [];
  for (const def of doctorDefs) {
    const user = await upsertUser(prisma, def.email, def.name, Role.DOCTOR, DEMO_PASSWORD.doctor);
    const profile = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: { specialisation: def.specialisation, slotDurationMins: 30 },
      create: { userId: user.id, specialisation: def.specialisation, slotDurationMins: 30 },
    });

    for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
      await prisma.workingHours.upsert({
        where: { doctorProfileId_dayOfWeek: { doctorProfileId: profile.id, dayOfWeek } },
        update: { startMinute: WORKDAY_START_MIN, endMinute: WORKDAY_END_MIN },
        create: {
          doctorProfileId: profile.id,
          dayOfWeek,
          startMinute: WORKDAY_START_MIN,
          endMinute: WORKDAY_END_MIN,
        },
      });
    }

    doctorProfiles.push({ ...def, user, profile });
  }

  say("Seeding patients...");
  const patientNames = ["Arjun Mehta", "Fatima Sheikh", "Ken Watanabe", "Lucia Fernandez", "Samuel Okafor", "Grace Lin"];
  const patients = [];
  for (let i = 0; i < patientNames.length; i++) {
    const user = await upsertUser(prisma, `patient${i + 1}@clinic.test`, patientNames[i], Role.PATIENT, DEMO_PASSWORD.patient);
    patients.push(user);
  }

  say("Seeding one leave range...");
  const leaveDoctor = doctorProfiles[0].profile;
  const today = localDateOf(new Date());
  const leaveStartStr = addDaysToDateString(today, 14);
  const leaveEndStr = addDaysToDateString(today, 15);
  const leaveStart = new Date(`${leaveStartStr}T00:00:00Z`);
  const leaveEnd = new Date(`${leaveEndStr}T00:00:00Z`);
  const existingLeave = await prisma.leave.findFirst({
    where: { doctorProfileId: leaveDoctor.id, startDate: leaveStart },
  });
  if (!existingLeave) {
    await prisma.leave.create({
      data: { doctorProfileId: leaveDoctor.id, startDate: leaveStart, endDate: leaveEnd, reason: "Conference travel" },
    });
  }

  say("Seeding a few completed past appointments with prescriptions...");
  const pastDoctor = doctorProfiles[1].profile; // Dr. Kapoor, Dermatology
  const sampleNotes = [
    {
      patient: patients[0],
      daysAgo: 10,
      symptomText: "Itchy red rash on both forearms for a week, mild swelling.",
      clinicalNotes:
        "Contact dermatitis, likely new detergent. No signs of infection. Prescribed topical steroid and antihistamine.",
      items: [
        { medicationName: "Hydrocortisone 1% cream", dosage: "thin layer", timesPerDay: 2, durationDays: 7 },
        { medicationName: "Cetirizine 10mg", dosage: "1 tablet", timesPerDay: 1, durationDays: 5 },
      ],
    },
    {
      patient: patients[1],
      daysAgo: 25,
      symptomText: "Persistent acne on cheeks and jawline, not improving with OTC wash.",
      clinicalNotes: "Moderate inflammatory acne. Starting topical retinoid + oral antibiotic course; review in 6 weeks.",
      items: [
        { medicationName: "Adapalene 0.1% gel", dosage: "pea-sized amount", timesPerDay: 1, durationDays: 42 },
        { medicationName: "Doxycycline 100mg", dosage: "1 capsule", timesPerDay: 2, durationDays: 14 },
      ],
    },
  ];

  for (const sample of sampleNotes) {
    // 10:00 in the clinic's own timezone (APP_TIMEZONE), not whatever
    // machine `npm run seed` happens to run on.
    const dateStr = addDaysToDateString(today, -sample.daysAgo);
    const startsAt = slotStartUtc(dateStr, 10 * 60);
    const endsAt = addMinutes(startsAt, 30);

    const existing = await prisma.booking.findFirst({
      where: { patientId: sample.patient.id, doctorProfileId: pastDoctor.id, startsAt },
    });
    if (existing) continue;

    const booking = await prisma.booking.create({
      data: { patientId: sample.patient.id, doctorProfileId: pastDoctor.id, status: "COMPLETED", startsAt, endsAt },
    });

    await prisma.symptomSubmission.create({
      data: { bookingId: booking.id, patientId: sample.patient.id, symptomText: sample.symptomText },
    });

    const prescription = await prisma.prescription.create({
      data: {
        bookingId: booking.id,
        doctorProfileId: pastDoctor.id,
        patientId: sample.patient.id,
        clinicalNotes: sample.clinicalNotes,
      },
    });

    for (const item of sample.items) {
      await prisma.prescriptionItem.create({ data: { ...item, prescriptionId: prescription.id } });
    }
  }

  say("Done.");
  say("");
  say("Demo accounts (password in parentheses):");
  say(`  Admin:   admin@clinic.test (${DEMO_PASSWORD.admin})`);
  for (const d of doctorDefs) {
    say(`  Doctor:  ${d.email} (${DEMO_PASSWORD.doctor}) — ${d.specialisation}`);
  }
  for (let i = 0; i < patientNames.length; i++) {
    say(`  Patient: patient${i + 1}@clinic.test (${DEMO_PASSWORD.patient})`);
  }

  return log;
}
