import { NextResponse } from "next/server";
import { withApiParams } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { stopMedicationReminders } from "@/services/medication";

export const POST = withApiParams<{ id: string }>(async (_req, { params }) => {
  const user = await requireRole("PATIENT");
  const cancelled = await stopMedicationReminders(user.id, params.id);
  return NextResponse.json({ cancelled });
});
