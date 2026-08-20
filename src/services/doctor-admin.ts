import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";

export interface WorkingHoursInput {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface CreateDoctorInput {
  email: string;
  password: string;
  name: string;
  specialisation: string;
  slotDurationMins: number;
  workingHours: WorkingHoursInput[];
}

/** Admin creates a doctor profile: account + specialisation + working hours in one step. */
export async function createDoctorAccount(input: CreateDoctorInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) {
    throw new AppError("VALIDATION_ERROR", "A user with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email.toLowerCase(), passwordHash, name: input.name, role: "DOCTOR" },
    });
    const profile = await tx.doctorProfile.create({
      data: {
        userId: user.id,
        specialisation: input.specialisation,
        slotDurationMins: input.slotDurationMins,
        workingHours: { create: input.workingHours },
      },
      include: { workingHours: true, user: true },
    });
    return profile;
  });
}

export async function listDoctorsWithDetails() {
  return prisma.doctorProfile.findMany({
    include: { user: true, workingHours: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { specialisation: "asc" },
  });
}
