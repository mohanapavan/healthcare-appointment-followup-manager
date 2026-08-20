import { NextResponse } from "next/server";
import { withApiParams } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { listMedicationReminders } from "@/services/medication";

export const GET = withApiParams<{ id: string }>(async (_req, { params }) => {
  const user = await requireRole("PATIENT");
  const reminders = await listMedicationReminders(user.id, params.id);
  return NextResponse.json({ reminders });
});
