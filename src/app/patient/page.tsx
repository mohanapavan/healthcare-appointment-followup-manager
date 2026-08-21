import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, Eyebrow } from "@/components/ui";
import { DoctorPortrait, portraitSrc } from "@/components/doctor-portrait";
import { AnimatedNumber, Stagger } from "@/components/motion";
import { ArrowRight, Calendar, Stethoscope } from "@/components/icons";
import { formatClinicDateTime } from "@/lib/format-clinic-time";

export default async function FindDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ specialisation?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { specialisation } = await searchParams;

  const [doctors, specialisations, nextBooking] = await Promise.all([
    prisma.doctorProfile.findMany({
      where: specialisation ? { specialisation } : undefined,
      include: { user: true },
      orderBy: { specialisation: "asc" },
    }),
    prisma.doctorProfile.findMany({ distinct: ["specialisation"], select: { specialisation: true } }),
    prisma.booking.findFirst({
      where: { patientId: session.user.id, status: "CONFIRMED", startsAt: { gt: new Date() } },
      include: { doctorProfile: { include: { user: true } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const daysUntil = nextBooking
    ? Math.max(0, Math.ceil((nextBooking.startsAt.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div>
      {/* Focal numeral: the next visit (§6.4 / def-of-done). */}
      {nextBooking ? (
        <Link href="/patient/appointments" className="group mb-8 block">
          <Card elevation={2} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <DoctorPortrait name={nextBooking.doctorProfile.user.name} src={portraitSrc(nextBooking.doctorProfileId)} size="xl" />
              <div>
                <Eyebrow>Your next visit</Eyebrow>
                <p className="mt-1 font-display text-lg font-semibold text-ink-900">
                  Dr. {nextBooking.doctorProfile.user.name}
                </p>
                <p className="font-tabular text-sm text-ink-500">
                  {formatClinicDateTime(nextBooking.startsAt, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <div className="numeral text-5xl text-clinical">
                {daysUntil === 0 ? "Today" : <AnimatedNumber value={daysUntil ?? 0} />}
              </div>
              {daysUntil !== 0 && (
                <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-500">
                  {daysUntil === 1 ? "day away" : "days away"}
                </div>
              )}
            </div>
          </Card>
        </Link>
      ) : null}

      <div className="mb-6">
        <Eyebrow>Find a doctor</Eyebrow>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">
          Book with a specialist
        </h1>
        <p className="mt-1 text-ink-500">Choose a specialisation, then pick a time on their day.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by specialisation">
        <FilterChip href="/patient" active={!specialisation} label="All" />
        {specialisations.map((s) => (
          <FilterChip
            key={s.specialisation}
            href={`/patient?specialisation=${encodeURIComponent(s.specialisation)}`}
            active={specialisation === s.specialisation}
            label={s.specialisation}
          />
        ))}
      </div>

      {doctors.length === 0 ? (
        <EmptyState
          title="No doctors found"
          subtitle="Try a different specialisation."
          illustration={<Stethoscope width={40} height={40} strokeWidth={1.25} />}
        />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {doctors.map((doctor) => (
            <Link key={doctor.id} href={`/patient/book/${doctor.id}`} className="group block">
              <Card className="flex items-center gap-4 transition-shadow hover:shadow-elev-2">
                <DoctorPortrait name={doctor.user.name} src={portraitSrc(doctor.id)} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-ink-900">Dr. {doctor.user.name}</p>
                  <p className="truncate text-sm text-ink-500">{doctor.specialisation}</p>
                  <p className="mt-1 font-tabular text-xs text-ink-500">{doctor.slotDurationMins}-minute appointments</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-line text-ink-500 transition-colors group-hover:border-clinical group-hover:bg-clinical group-hover:text-white">
                  <ArrowRight width={16} height={16} />
                </span>
              </Card>
            </Link>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-clinical bg-clinical text-white shadow-elev-1"
          : "border-ink-line bg-surface-raised text-ink-700 hover:border-clinical hover:text-clinical"
      }`}
    >
      {label === "All" && <Calendar width={14} height={14} />}
      {label}
    </Link>
  );
}
