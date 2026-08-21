import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatClinicDateTime, formatClinicTime } from "@/lib/format-clinic-time";
import { Card, EmptyState, Eyebrow, PageHeader, StatusBadge, UrgencyBadge, AiDisclosure } from "@/components/ui";
import { DoctorPortrait, portraitSrc } from "@/components/doctor-portrait";
import { DoseStrip } from "@/components/dose-strip";
import { Stagger } from "@/components/motion";
import { Calendar } from "@/components/icons";
import { CancelAppointmentButton } from "./cancel-button";
import { MedicationReminders } from "./medication-reminders";

type PreVisit = { urgency: "Low" | "Medium" | "High"; chiefComplaint: string; questions: string[] };
type PostVisit = { summary: string; medicationSchedule: { medication: string; dosage: string; schedule: string }[]; followUpSteps: string[] };

export default async function MyAppointmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookings = await prisma.booking.findMany({
    where: { patientId: session.user.id, status: { not: "HELD" } },
    include: {
      doctorProfile: { include: { user: true } },
      prescription: { include: { items: true } },
    },
    orderBy: { startsAt: "desc" },
  });
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const aiGenerations = await prisma.aiGeneration.findMany({
    where: {
      OR: [
        { entityType: "BOOKING_PRE_VISIT", entityId: { in: bookings.map((b) => b.id) } },
        { entityType: "PRESCRIPTION_POST_VISIT", entityId: { in: bookings.filter((b) => b.prescription).map((b) => b.prescription!.id) } },
      ],
    },
  });
  const preVisitByBooking = new Map(aiGenerations.filter((g) => g.entityType === "BOOKING_PRE_VISIT").map((g) => [g.entityId, g]));
  const postVisitByPrescription = new Map(aiGenerations.filter((g) => g.entityType === "PRESCRIPTION_POST_VISIT").map((g) => [g.entityId, g]));

  const next = [...bookings].reverse().find((b) => b.status === "CONFIRMED" && b.startsAt.getTime() > now) ?? null;
  const rest = bookings.filter((b) => b.id !== next?.id);

  return (
    <div>
      <PageHeader title="My appointments" />

      {bookings.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          subtitle="Find a doctor to book your first visit."
          illustration={<Calendar width={40} height={40} strokeWidth={1.25} />}
          action={
            <Link href="/patient" className="font-medium text-clinical underline underline-offset-2">
              Find a doctor
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {/* Featured: the next visit — date/time as the focal numeral (§6.4). */}
          {next && (
            <Card elevation={2}>
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <DoctorPortrait name={next.doctorProfile.user.name} src={portraitSrc(next.doctorProfileId)} size="xl" />
                  <div>
                    <Eyebrow>Your next visit</Eyebrow>
                    <p className="mt-1 font-display text-lg font-semibold text-ink-900">Dr. {next.doctorProfile.user.name}</p>
                    <p className="text-sm text-ink-500">{next.doctorProfile.specialisation}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="numeral text-4xl text-clinical">
                    {formatClinicTime(next.startsAt, { hour: "numeric", minute: "2-digit" })}
                  </div>
                  <p className="mt-1 font-tabular text-sm text-ink-500">
                    {formatClinicDateTime(next.startsAt, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-ink-line pt-4">
                <StatusBadge status={next.status} />
                <CancelAppointmentButton bookingId={next.id} />
              </div>
            </Card>
          )}

          <div>
            {next && <Eyebrow className="mb-3">History</Eyebrow>}
            <Stagger className="space-y-4">
              {rest.map((booking) => {
                const preGen = preVisitByBooking.get(booking.id);
                const pre = preGen?.parsedOutput as PreVisit | undefined;
                const postGen = booking.prescription ? postVisitByPrescription.get(booking.prescription.id) : undefined;
                const post = postGen?.parsedOutput as PostVisit | undefined;
                const canCancel = booking.status === "CONFIRMED" && booking.startsAt.getTime() > now;

                return (
                  <Card key={booking.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <DoctorPortrait name={booking.doctorProfile.user.name} src={portraitSrc(booking.doctorProfileId)} size="md" />
                        <div>
                          <p className="font-display font-semibold text-ink-900">Dr. {booking.doctorProfile.user.name}</p>
                          <p className="text-sm text-ink-500">{booking.doctorProfile.specialisation}</p>
                          <p className="mt-0.5 font-tabular text-sm text-ink-700">
                            {formatClinicDateTime(booking.startsAt, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={booking.status} />
                        {canCancel && <CancelAppointmentButton bookingId={booking.id} />}
                      </div>
                    </div>

                    {/* Pre-visit summary — brass-ruled AI surface (§6.4). */}
                    {pre && booking.status === "CONFIRMED" && (
                      <div className="mt-4 rounded-md border border-ink-line border-l-2 border-l-brass bg-surface-raised px-4 py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <p className="text-sm font-medium text-ink-900">Pre-visit summary</p>
                          <UrgencyBadge urgency={pre.urgency} />
                        </div>
                        <p className="text-sm text-ink-700">{pre.chiefComplaint}</p>
                        <AiDisclosure source={preGen?.source} />
                      </div>
                    )}

                    {booking.status === "COMPLETED" && post && (
                      <div className="mt-4 rounded-md border border-ink-line border-l-2 border-l-brass bg-surface-raised px-4 py-3">
                        <p className="mb-1 text-sm font-medium text-ink-900">Visit summary</p>
                        <p className="text-sm text-ink-700">{post.summary}</p>

                        {booking.prescription && booking.prescription.items.length > 0 && (
                          <div className="mt-4 space-y-2.5">
                            <Eyebrow>Medication schedule</Eyebrow>
                            {booking.prescription.items.map((item) => (
                              <DoseStrip
                                key={item.id}
                                medicationName={item.medicationName}
                                dosage={item.dosage}
                                timesPerDay={item.timesPerDay}
                                durationDays={item.durationDays}
                              />
                            ))}
                          </div>
                        )}

                        {post.followUpSteps.length > 0 && (
                          <ul className="mt-4 space-y-1.5">
                            {post.followUpSteps.map((step, i) => (
                              <li key={i} className="flex gap-2 text-sm text-ink-700">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-confirmed" />
                                {step}
                              </li>
                            ))}
                          </ul>
                        )}
                        <AiDisclosure source={postGen?.source} />
                        {booking.prescription && booking.prescription.items.length > 0 && (
                          <MedicationReminders items={booking.prescription.items} />
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </Stagger>
          </div>
        </div>
      )}
    </div>
  );
}
