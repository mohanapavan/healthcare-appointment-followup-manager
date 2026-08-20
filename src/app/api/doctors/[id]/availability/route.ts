import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiParams, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/authz";
import { getAvailability } from "@/services/availability";
import { dayOfWeekOf } from "@/lib/clinic-time";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export const GET = withApiParams<{ id: string }>(async (req: NextRequest, { params }) => {
  await requireAuth();
  const { id } = params;
  const { date } = parseQuery(req, querySchema);

  const slots = await getAvailability(id, date);

  // getAvailability already did the real leave/working-hours checks; these
  // are cheap re-checks purely so an empty day can tell the UI *why* it's
  // empty (on leave vs. doesn't work that day vs. fully booked) without
  // duplicating the availability computation itself.
  let reason: "ON_LEAVE" | "NO_WORKING_HOURS" | "FULLY_BOOKED" | null = null;
  if (slots.length === 0) {
    const dateOnly = new Date(`${date}T00:00:00Z`);
    const onLeave = await prisma.leave.findFirst({
      where: { doctorProfileId: id, startDate: { lte: dateOnly }, endDate: { gte: dateOnly } },
    });
    if (onLeave) {
      reason = "ON_LEAVE";
    } else {
      const hours = await prisma.workingHours.findUnique({
        where: { doctorProfileId_dayOfWeek: { doctorProfileId: id, dayOfWeek: dayOfWeekOf(date) } },
      });
      reason = hours ? "FULLY_BOOKED" : "NO_WORKING_HOURS";
    }
  }

  return NextResponse.json({
    doctorProfileId: id,
    date,
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
    emptyReason: reason,
  });
});
