import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiParams, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/authz";
import { getAvailability } from "@/services/availability";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export const GET = withApiParams<{ id: string }>(async (req: NextRequest, { params }) => {
  await requireAuth();
  const { id } = params;
  const { date } = parseQuery(req, querySchema);

  const slots = await getAvailability(id, date);

  return NextResponse.json({
    doctorProfileId: id,
    date,
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
  });
});
