import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { confirmBooking } from "@/services/booking";

const bodySchema = z.object({
  holdToken: z.string().min(1),
  // Allow an explicit empty string ("no symptoms to report") but require the
  // field to be present — the pre-visit LLM prompt has a documented fallback
  // for empty text, this is not a validation gap.
  symptomText: z.string().max(4000),
});

export const POST = withApi(async (req: NextRequest, { correlationId }) => {
  const user = await requireRole("PATIENT");
  const { holdToken, symptomText } = await parseBody(req, bodySchema);
  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;

  const { booking, replay } = await confirmBooking(
    user.id,
    holdToken,
    symptomText,
    idempotencyKey,
    correlationId
  );

  return NextResponse.json(
    {
      id: booking.id,
      status: booking.status,
      doctorProfileId: booking.doctorProfileId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      replay,
    },
    { status: replay ? 200 : 201 }
  );
});
