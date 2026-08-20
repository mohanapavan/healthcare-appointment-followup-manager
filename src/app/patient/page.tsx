import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function FindDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ specialisation?: string }>;
}) {
  const { specialisation } = await searchParams;

  const [doctors, specialisations] = await Promise.all([
    prisma.doctorProfile.findMany({
      where: specialisation ? { specialisation } : undefined,
      include: { user: true },
      orderBy: { specialisation: "asc" },
    }),
    prisma.doctorProfile.findMany({ distinct: ["specialisation"], select: { specialisation: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Find a doctor" subtitle="Search by specialisation, then pick a time on their day." />

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter by specialisation">
        <Link
          href="/patient"
          className={`rounded-full px-3 py-1.5 text-sm border ${!specialisation ? "bg-clinical text-white border-clinical" : "border-line text-ink hover:bg-paper-raised"}`}
        >
          All
        </Link>
        {specialisations.map((s) => (
          <Link
            key={s.specialisation}
            href={`/patient?specialisation=${encodeURIComponent(s.specialisation)}`}
            className={`rounded-full px-3 py-1.5 text-sm border ${specialisation === s.specialisation ? "bg-clinical text-white border-clinical" : "border-line text-ink hover:bg-paper-raised"}`}
          >
            {s.specialisation}
          </Link>
        ))}
      </div>

      {doctors.length === 0 ? (
        <EmptyState title="No doctors found" subtitle="Try a different specialisation." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {doctors.map((doctor) => (
            <Card key={doctor.id}>
              <p className="font-display font-semibold text-ink">Dr. {doctor.user.name}</p>
              <p className="text-sm text-ink-muted mt-0.5">{doctor.specialisation}</p>
              <p className="text-xs text-ink-muted mt-2 font-tabular">
                {doctor.slotDurationMins}-minute appointments
              </p>
              <Link
                href={`/patient/book/${doctor.id}`}
                className="mt-4 inline-block rounded-md bg-clinical px-4 py-2 text-sm font-medium text-white hover:bg-clinical-dark"
              >
                View availability
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
