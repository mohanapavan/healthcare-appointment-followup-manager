import { listDoctorsWithDetails } from "@/services/doctor-admin";
import { Card, Eyebrow, Stat } from "@/components/ui";
import { CreateDoctorForm } from "./create-doctor-form";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default async function AdminDoctorsPage() {
  const doctors = await listDoctorsWithDetails();
  const specialisations = new Set(doctors.map((d) => d.specialisation));
  const bookable = doctors.filter((d) => d.workingHours.length > 0).length;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Staff</Eyebrow>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">Doctors</h1>
          <p className="mt-1 text-ink-500">Specialisations, working hours, and slot durations.</p>
        </div>
        <div className="flex gap-8">
          <Stat value={doctors.length} label="on staff" size="md" />
          <Stat value={specialisations.size} label="specialisations" size="md" tone="clinical" />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {/* Roster table with sticky header (§6.6) */}
        <Card className="overflow-hidden p-0">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-base">
                <tr className="border-b border-ink-line text-left text-ink-500">
                  <th className="px-5 py-3 font-medium">Doctor</th>
                  <th className="px-5 py-3 font-medium">Specialisation</th>
                  <th className="px-5 py-3 text-right font-medium">Slot</th>
                  <th className="px-5 py-3 font-medium">Working days</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => (
                  <tr key={d.id} className="border-b border-ink-line align-top last:border-0 hover:bg-surface-base/60">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink-900">Dr. {d.user.name}</p>
                      <p className="font-tabular text-xs text-ink-500">{d.user.email}</p>
                    </td>
                    <td className="px-5 py-3.5 text-ink-700">{d.specialisation}</td>
                    <td className="px-5 py-3.5 text-right font-tabular text-ink-700">{d.slotDurationMins}m</td>
                    <td className="px-5 py-3.5">
                      {d.workingHours.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {[...d.workingHours]
                            .sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7))
                            .map((h) => (
                              <span
                                key={h.dayOfWeek}
                                title={`${formatMinute(h.startMinute)}–${formatMinute(h.endMinute)}`}
                                className="rounded border border-ink-line bg-surface-base px-1.5 py-0.5 font-tabular text-[11px] text-ink-500"
                              >
                                {DAY_NAMES[h.dayOfWeek]}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-caution-ink">Not bookable — no hours</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bookable < doctors.length && (
            <div className="border-t border-ink-line bg-caution-wash px-5 py-2.5 text-xs font-medium text-caution-ink">
              {doctors.length - bookable} doctor{doctors.length - bookable === 1 ? "" : "s"} not yet bookable — no working hours set.
            </div>
          )}
        </Card>

        <CreateDoctorForm />
      </div>
    </div>
  );
}
