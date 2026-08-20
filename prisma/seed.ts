/**
 * Seeds one admin, four doctors (distinct specialisations, Mon-Fri working
 * hours), six patients, one leave range, and a few completed past
 * appointments with prescriptions — enough to exercise every portal without
 * an empty-state on first login. Idempotent: safe to re-run (upserts by
 * email; clears and re-inserts bookings/leaves it owns).
 */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const DEMO_PASSWORD = {
  admin: "Admin123!",
  doctor: "Doctor123!",
  patient: "Patient123!",
};

async function upsertUser(email: string, name: string, role: Role, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash },
  });
}

const WORKDAY_START_MIN = 9 * 60; // 09:00
const WORKDAY_END_MIN = 17 * 60; // 17:00

async function main() {
  console.log("Seeding admin...");
  await upsertUser("admin@clinic.test", "Priya Sharma", Role.ADMIN, DEMO_PASSWORD.admin);

  console.log("Seeding doctors...");
  const doctorDefs = [
    { email: "dr.nair@clinic.test", name: "Dr. Meera Nair", specialisation: "Cardiology" },
    { email: "dr.kapoor@clinic.test", name: "Dr. Rohan Kapoor", specialisation: "Dermatology" },
    { email: "dr.khan@clinic.test", name: "Dr. Ayesha Khan", specialisation: "Pediatrics" },
    { email: "dr.rao@clinic.test", name: "Dr. Vikram Rao", specialisation: "Orthopedics" },
  ];

  const doctorProfiles = [];
  for (const def of doctorDefs) {
    const user = await upsertUser(def.email, def.name, Role.DOCTOR, DEMO_PASSWORD.doctor);
    const profile = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: { specialisation: def.specialisation, slotDurationMins: 30 },
      create: { userId: user.id, specialisation: def.specialisation, slotDurationMins: 30 },
    });

    // Mon-Fri 09:00-17:00
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

  console.log("Seeding patients...");
  const patientNames = [
    "Arjun Mehta",
    "Fatima Sheikh",
    "Ken Watanabe",
    "Lucia Fernandez",
    "Samuel Okafor",
    "Grace Lin",
  ];
  const patients = [];
  for (let i = 0; i < patientNames.length; i++) {
    const email = `patient${i + 1}@clinic.test`;
    const user = await upsertUser(email, patientNames[i], Role.PATIENT, DEMO_PASSWORD.patient);
    patients.push(user);
  }

  console.log("Seeding one leave range...");
  const leaveDoctor = doctorProfiles[0].profile;
  const leaveStart = addDays(startOfDay(new Date()), 14);
  const leaveEnd = addDays(startOfDay(new Date()), 15);
  const existingLeave = await prisma.leave.findFirst({
    where: { doctorProfileId: leaveDoctor.id, startDate: leaveStart },
  });
  if (!existingLeave) {
    await prisma.leave.create({
      data: {
        doctorProfileId: leaveDoctor.id,
        startDate: leaveStart,
        endDate: leaveEnd,
        reason: "Conference travel",
      },
    });
  }

  console.log("Seeding a few completed past appointments with prescriptions...");
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
      clinicalNotes:
        "Moderate inflammatory acne. Starting topical retinoid + oral antibiotic course; review in 6 weeks.",
      items: [
        { medicationName: "Adapalene 0.1% gel", dosage: "pea-sized amount", timesPerDay: 1, durationDays: 42 },
        { medicationName: "Doxycycline 100mg", dosage: "1 capsule", timesPerDay: 2, durationDays: 14 },
      ],
    },
  ];

  for (const sample of sampleNotes) {
    const startsAt = addMinutes(addDays(new Date(), -sample.daysAgo), -new Date().getMinutes());
    startsAt.setHours(10, 0, 0, 0);
    const endsAt = addMinutes(startsAt, 30);

    const existing = await prisma.booking.findFirst({
      where: {
        patientId: sample.patient.id,
        doctorProfileId: pastDoctor.id,
        startsAt,
      },
    });
    if (existing) continue;

    const booking = await prisma.booking.create({
      data: {
        patientId: sample.patient.id,
        doctorProfileId: pastDoctor.id,
        status: "COMPLETED",
        startsAt,
        endsAt,
      },
    });

    await prisma.symptomSubmission.create({
      data: {
        bookingId: booking.id,
        patientId: sample.patient.id,
        symptomText: sample.symptomText,
      },
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
      await prisma.prescriptionItem.create({
        data: { ...item, prescriptionId: prescription.id },
      });
    }
  }

  console.log("Done.");
  console.log("");
  console.log("Demo accounts (password in parentheses):");
  console.log(`  Admin:   admin@clinic.test (${DEMO_PASSWORD.admin})`);
  for (const d of doctorDefs) {
    console.log(`  Doctor:  ${d.email} (${DEMO_PASSWORD.doctor}) — ${d.specialisation}`);
  }
  for (let i = 0; i < patientNames.length; i++) {
    console.log(`  Patient: patient${i + 1}@clinic.test (${DEMO_PASSWORD.patient})`);
  }
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function addMinutes(d: Date, minutes: number) {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() + minutes);
  return copy;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
