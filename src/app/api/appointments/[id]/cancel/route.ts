import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiParams, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { cancelBooking } from "@/services/booking";

const bodySchema = z.object({
  reason: z.string().max(500).default("Cancelled by patient"),
});

export const POST = withApiParams<{ id: string }>(async (req: NextRequest, { params, correlationId }) => {
  const user = await requireRole("PATIENT");
  const { reason } = await parseBody(req, bodySchema);

  const booking = await cancelBooking(user.id, params.id, reason, correlationId);

  return NextResponse.json({ booking });
});
