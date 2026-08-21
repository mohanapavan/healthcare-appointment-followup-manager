import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findNextAvailableSlots } from "@/services/availability";
import { dayOfWeekOf, localDateOf } from "@/lib/clinic-time";

/**
 * Public system stats for the landing page (§6.1). Live from the database, not
 * hardcoded — a landing page that shows real system state is the flex a static
 * template can't fake. Read-only; adds no new service logic.
 */
export const GET = withApi(async () => {
  const today = localDateOf(new Date());
  const dow = dayOfWeekOf(today);
  const todayDate = new Date(`${today}T00:00:00Z`);

  const [doctors, availableToday, specialisations] = await Promise.all([
    prisma.doctorProfile.findMany({ select: { id: true } }),
    prisma.doctorProfile.count({
      where: {
        workingHours: { some: { dayOfWeek: dow } },
        leaves: { none: { startDate: { lte: todayDate }, endDate: { gte: todayDate } } },
      },
    }),
    prisma.doctorProfile.findMany({ distinct: ["specialisation"], select: { specialisation: true } }),
  ]);

  // Earliest open slot across every doctor.
  const now = new Date();
  let nextOpenSlot: string | null = null;
  const perDoctor = await Promise.all(doctors.map((d) => findNextAvailableSlots(d.id, now, 1)));
  for (const slots of perDoctor) {
    const s = slots[0]?.startsAt;
    if (s && (!nextOpenSlot || s < new Date(nextOpenSlot))) nextOpenSlot = s.toISOString();
  }

  return NextResponse.json({
    doctorsAvailableToday: availableToday,
    doctorsTotal: doctors.length,
    specialisations: specialisations.length,
    nextOpenSlot,
  });
});
