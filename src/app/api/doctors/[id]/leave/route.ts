import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiParams, parseBody } from "@/lib/api";
import { requireAdminOrOwningDoctor } from "@/lib/authz";
import { createLeaveWithCancellations, listLeave } from "@/services/leave";

const createSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  reason: z.string().min(1).max(500),
});

export const GET = withApiParams<{ id: string }>(async (_req, { params }) => {
  await requireAdminOrOwningDoctor(params.id);
  const leave = await listLeave(params.id);
  return NextResponse.json({ leave });
});

/** Creates the leave and cancels affected bookings in one step — the client is expected to call the /preview endpoint first and show the admin/doctor what this will affect before posting here. */
export const POST = withApiParams<{ id: string }>(async (req: NextRequest, { params, correlationId }) => {
  const user = await requireAdminOrOwningDoctor(params.id);
  const { startDate, endDate, reason } = await parseBody(req, createSchema);

  const result = await createLeaveWithCancellations(
    params.id,
    new Date(`${startDate}T00:00:00Z`),
    new Date(`${endDate}T00:00:00Z`),
    reason,
    user.id,
    correlationId
  );

  return NextResponse.json(result, { status: 201 });
});
