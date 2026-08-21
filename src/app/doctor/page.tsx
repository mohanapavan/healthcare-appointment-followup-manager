import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDaysToDateString, localDateOf, slotStartUtc } from "@/lib/clinic-time";
import { CLINIC_TIME_ZONE, formatClinicDate, formatClinicTime } from "@/lib/format-clinic-time";
import { Card, EmptyState, Eyebrow, StatusBadge, UrgencyBadge } from "@/components/ui";
import { LiveClock } from "@/components/live-clock";
import { AnimatedNumber, Stagger } from "@/components/motion";
import { AlertTriangle, ArrowRight, Stethoscope } from "@/components/icons";

type Urgency = "Low" | "Medium" | "High";

export default async function DoctorTodayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: session.user.id } });
  if (!doctorProfile) {
    return <EmptyState title="No doctor profile found" subtitle="Ask an admin to set up your profile." />;
  }

  const today = localDateOf(new Date());
  const dayStart = slotStartUtc(today, 0);
  const dayEnd = slotStartUtc(addDaysToDateString(today, 1), 0);

  const bookings = await prisma.booking.findMany({
    where: {
      doctorProfileId: doctorProfile.id,
      startsAt: { gte: dayStart, lt: dayEnd },
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
    include: { patient: true },
    orderBy: { startsAt: "asc" },
  });

  const preVisits = await prisma.aiGeneration.findMany({
    where: { entityType: "BOOKING_PRE_VISIT", entityId: { in: bookings.map((b) => b.id) } },
  });
  const preVisitByBooking = new Map(preVisits.map((g) => [g.entityId, g]));

  const rows = bookings.map((b) => {
    const output = preVisitByBooking.get(b.id)?.parsedOutput as
      | { urgency: Urgency; chiefComplaint: string }
      | undefined;
    return { booking: b, urgency: output?.urgency, complaint: output?.chiefComplaint };
  });
  const highUrgency = rows.filter((r) => r.urgency === "High");
  const remaining = rows.filter((r) => r.booking.status === "CONFIRMED").length;

  const initialTime = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());

  return (
    <div>
      {/* Inverse header — the focal numeral (§6.5). */}
      <div className="mb-8 overflow-hidden rounded-lg bg-surface-inverse shadow-elev-2">
        <div className="flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Today&rsquo;s clinic day</p>
            <p className="mt-2 font-display text-xl font-semibold text-white">
              {formatClinicDate(new Date(`${today}T12:00:00Z`), { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-confirmed" /> Now {" "}
              <LiveClock initial={initialTime} className="text-white/80" />
            </p>
          </div>
          <div className="flex items-end gap-8">
            <div>
              <div className="numeral text-6xl text-white">
                <AnimatedNumber value={bookings.length} />
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-white/50">
                {bookings.length === 1 ? "patient" : "patients"}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="numeral text-4xl text-white/70">
                <AnimatedNumber value={remaining} />
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-white/50">still to see</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pinned high-urgency strip (§6.5) — label + weight + icon + colour. */}
      {highUrgency.length > 0 && (
        <div className="mb-6 rounded-lg border border-urgent-line bg-urgent-wash p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-urgent">
            <AlertTriangle width={16} height={16} />
            {highUrgency.length} high-urgency {highUrgency.length === 1 ? "patient" : "patients"} — see first
          </p>
          <div className="space-y-2">
            {highUrgency.map(({ booking, complaint }) => (
              <Link
                key={booking.id}
                href={`/doctor/appointments/${booking.id}`}
                className="flex items-center gap-3 rounded-md border border-urgent-line bg-surface-overlay px-3 py-2 shadow-elev-1 hover:border-urgent"
              >
                <span className="font-tabular text-sm font-semibold text-ink-900">
                  {formatClinicTime(booking.startsAt, { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="font-medium text-ink-900">{booking.patient.name}</span>
                {complaint && <span className="hidden truncate text-sm text-ink-500 sm:block">— {complaint}</span>}
                <UrgencyBadge urgency="High" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {bookings.length === 0 ? (
        <EmptyState
          title="No appointments today"
          subtitle="Your day sheet is clear. Enjoy the quiet."
          illustration={<Stethoscope width={40} height={40} strokeWidth={1.25} />}
        />
      ) : (
        <div>
          <Eyebrow className="mb-3">Day sheet</Eyebrow>
          <Stagger className="space-y-2.5">
            {rows.map(({ booking, urgency, complaint }) => (
              <Link key={booking.id} href={`/doctor/appointments/${booking.id}`} className="group block">
                <Card className="flex items-center gap-4 py-4 transition-shadow hover:shadow-elev-2">
                <div className="w-16 shrink-0 border-r border-ink-line pr-4 text-right">
                  <div className="font-tabular text-sm font-semibold text-ink-900">
                    {formatClinicTime(booking.startsAt, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{booking.patient.name}</p>
                  {complaint && <p className="truncate text-sm text-ink-500">{complaint}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {urgency && <UrgencyBadge urgency={urgency} />}
                  <StatusBadge status={booking.status} />
                  <ArrowRight width={16} height={16} className="text-ink-400 transition-colors group-hover:text-clinical" />
                </div>
                </Card>
              </Link>
            ))}
          </Stagger>
        </div>
      )}
    </div>
  );
}
