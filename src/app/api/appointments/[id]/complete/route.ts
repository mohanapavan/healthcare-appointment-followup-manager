import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiParams, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { completeVisit } from "@/services/visit";

const bodySchema = z.object({
  clinicalNotes: z.string().min(1).max(4000),
  prescriptionItems: z
    .array(
      z.object({
        medicationName: z.string().min(1).max(200),
        dosage: z.string().min(1).max(100),
        timesPerDay: z.number().int().min(1).max(12),
        durationDays: z.number().int().min(1).max(365),
        instructions: z.string().max(500).optional(),
      })
    )
    .default([]),
});

export const POST = withApiParams<{ id: string }>(async (req: NextRequest, { params, correlationId }) => {
  const user = await requireRole("DOCTOR");
  const { clinicalNotes, prescriptionItems } = await parseBody(req, bodySchema);

  const prescription = await completeVisit(user.id, params.id, clinicalNotes, prescriptionItems, correlationId);

  return NextResponse.json({ prescription }, { status: 201 });
});
