import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { listDoctorsWithDetails } from "@/services/doctor-admin";

export const GET = withApi(async () => {
  await requireRole("ADMIN");
  const doctors = await listDoctorsWithDetails();
  return NextResponse.json({
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.user.name,
      email: d.user.email,
      specialisation: d.specialisation,
      slotDurationMins: d.slotDurationMins,
      workingHours: d.workingHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startMinute: h.startMinute,
        endMinute: h.endMinute,
      })),
    })),
  });
});
