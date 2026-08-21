import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiParams, parseBody } from "@/lib/api";
import { requireAdminOrOwningDoctor } from "@/lib/authz";
import { previewLeaveImpact } from "@/services/leave";

const bodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
});

/** "3 appointments are affected" preview shown before the admin/doctor confirms marking a range as leave (the spec §2). */
export const POST = withApiParams<{ id: string }>(async (req: NextRequest, { params }) => {
  await requireAdminOrOwningDoctor(params.id);
  const { startDate, endDate } = await parseBody(req, bodySchema);

  const affected = await previewLeaveImpact(
    params.id,
    new Date(`${startDate}T00:00:00Z`),
    new Date(`${endDate}T00:00:00Z`)
  );

  return NextResponse.json({
    affectedCount: affected.length,
    affected: affected.map((b) => ({
      bookingId: b.id,
      patientName: b.patient.name,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: b.status,
    })),
  });
});
