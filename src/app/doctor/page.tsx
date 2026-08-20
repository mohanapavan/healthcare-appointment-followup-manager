import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDaysToDateString, localDateOf, slotStartUtc } from "@/lib/clinic-time";
import { formatClinicDate, formatClinicTime } from "@/lib/format-clinic-time";
import { Card, EmptyState, PageHeader, StatusBadge, UrgencyBadge } from "@/components/ui";

export default async function DoctorTodayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: session.user.id } });
  if (!doctorProfile) {
    return <EmptyState title="No doctor profile found" subtitle="Ask an admin to set up your profile." />;
  }

  const today = localDateOf(new Date());
  const dayStart = slotStartUtc(today, 0);
  // Not slotStartUtc(today, 1440) — "24:00" is not a valid time-of-day for
  // the underlying parser and silently resolves to the SAME instant as
  // 00:00, making the query range empty (caught in manual browser testing:
  // a real booking today didn't show up under "Today's clinic day").
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

  return (
    <div>
      <PageHeader
        title="Today's clinic day"
        subtitle={formatClinicDate(new Date(`${today}T12:00:00Z`), {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      />

      {bookings.length === 0 ? (
        <EmptyState title="No appointments today" subtitle="Enjoy the quiet." />
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const preVisit = preVisitByBooking.get(booking.id);
            const output = preVisit?.parsedOutput as { urgency: "Low" | "Medium" | "High"; chiefComplaint: string } | undefined;
            return (
              <Link key={booking.id} href={`/doctor/appointments/${booking.id}`}>
                <Card className="hover:border-clinical transition-colors">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <span className="font-tabular text-sm font-semibold text-ink w-20 shrink-0">
                        {formatClinicTime(booking.startsAt, { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <div>
                        <p className="font-medium text-ink">{booking.patient.name}</p>
                        {output && <p className="text-sm text-ink-muted">{output.chiefComplaint}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {output && <UrgencyBadge urgency={output.urgency} />}
                      <StatusBadge status={booking.status} />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
