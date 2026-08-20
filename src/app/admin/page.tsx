import { listDoctorsWithDetails } from "@/services/doctor-admin";
import { Card, PageHeader } from "@/components/ui";
import { CreateDoctorForm } from "./create-doctor-form";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default async function AdminDoctorsPage() {
  const doctors = await listDoctorsWithDetails();

  return (
    <div>
      <PageHeader title="Doctors" subtitle="Specialisations, working hours, and slot durations." />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-3">
          {doctors.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <p className="font-display font-semibold text-ink">Dr. {d.user.name}</p>
                  <p className="text-sm text-ink-muted">
                    {d.specialisation} · {d.user.email}
                  </p>
                </div>
                <span className="font-tabular text-xs text-ink-muted">{d.slotDurationMins}-min slots</span>
              </div>
              {d.workingHours.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.workingHours.map((h) => (
                    <span key={h.dayOfWeek} className="font-tabular text-xs rounded bg-paper border border-line px-2 py-1 text-ink-muted">
                      {DAY_NAMES[h.dayOfWeek]} {formatMinute(h.startMinute)}–{formatMinute(h.endMinute)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-caution mt-2">No working hours set — not bookable yet.</p>
              )}
            </Card>
          ))}
        </div>

        <CreateDoctorForm />
      </div>
    </div>
  );
}
