import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { holdSlot } from "@/services/booking";

const bodySchema = z.object({
  doctorProfileId: z.string().min(1),
  startsAt: z.string().datetime({ message: "startsAt must be an ISO-8601 timestamp" }),
});

export const POST = withApi(async (req: NextRequest, { correlationId }) => {
  const user = await requireRole("PATIENT");
  const { doctorProfileId, startsAt } = await parseBody(req, bodySchema);

  const booking = await holdSlot(user.id, doctorProfileId, new Date(startsAt), correlationId);

  return NextResponse.json(
    {
      holdToken: booking.holdToken,
      holdExpiresAt: booking.holdExpiresAt,
      doctorProfileId: booking.doctorProfileId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
    },
    { status: 201 }
  );
});
