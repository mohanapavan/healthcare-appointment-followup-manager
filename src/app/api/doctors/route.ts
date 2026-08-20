import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createDoctorAccount } from "@/services/doctor-admin";

const querySchema = z.object({
  specialisation: z.string().min(1).optional(),
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(200),
  specialisation: z.string().min(1).max(200),
  slotDurationMins: z.number().int().min(5).max(240).default(30),
  workingHours: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      })
    )
    .default([]),
});

export const GET = withApi(async (req: NextRequest) => {
  await requireAuth();
  const { specialisation } = parseQuery(req, querySchema);

  const doctors = await prisma.doctorProfile.findMany({
    where: specialisation ? { specialisation: { equals: specialisation, mode: "insensitive" } } : undefined,
    select: {
      id: true,
      specialisation: true,
      slotDurationMins: true,
      user: { select: { name: true } },
      workingHours: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
    },
    orderBy: { specialisation: "asc" },
  });

  return NextResponse.json({
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.user.name,
      specialisation: d.specialisation,
      slotDurationMins: d.slotDurationMins,
      workingHours: d.workingHours,
    })),
  });
});

export const POST = withApi(async (req: NextRequest) => {
  await requireRole("ADMIN");
  const input = await parseBody(req, createSchema);
  const profile = await createDoctorAccount(input);
  return NextResponse.json({ doctorProfile: profile }, { status: 201 });
});
