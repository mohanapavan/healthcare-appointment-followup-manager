import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  specialisation: z.string().min(1).optional(),
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
    },
    orderBy: { specialisation: "asc" },
  });

  return NextResponse.json({
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.user.name,
      specialisation: d.specialisation,
      slotDurationMins: d.slotDurationMins,
    })),
  });
});
