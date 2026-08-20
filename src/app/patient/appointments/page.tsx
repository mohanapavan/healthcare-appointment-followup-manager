import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatClinicDateTime } from "@/lib/format-clinic-time";
import { Card, EmptyState, PageHeader, StatusBadge, UrgencyBadge, AiDisclosure } from "@/components/ui";
import { CancelAppointmentButton } from "./cancel-button";
import { MedicationReminders } from "./medication-reminders";

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
  // This is a Server Component: it runs fresh per request, not memoized the
  // way the purity rule's Client-Component/React-Compiler model assumes —
  // "what time is it right now, on the server, for this request" is exactly
  // the right place to call Date.now() once, up front.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const aiGenerations = await prisma.aiGeneration.findMany({
    where: {
      OR: [
        { entityType: "BOOKING_PRE_VISIT", entityId: { in: bookings.map((b) => b.id) } },
        {
          entityType: "PRESCRIPTION_POST_VISIT",
          entityId: { in: bookings.filter((b) => b.prescription).map((b) => b.prescription!.id) },
        },
      ],
    },
  });
  const preVisitByBooking = new Map(
    aiGenerations.filter((g) => g.entityType === "BOOKING_PRE_VISIT").map((g) => [g.entityId, g])
  );
  const postVisitByPrescription = new Map(
    aiGenerations.filter((g) => g.entityType === "PRESCRIPTION_POST_VISIT").map((g) => [g.entityId, g])
  );

  return (
    <div>
      <PageHeader title="My appointments" />

      {bookings.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          subtitle="Find a doctor to book your first visit."
          action={
            <a href="/patient" className="text-clinical font-medium underline">
              Find a doctor
            </a>
          }
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const preVisit = preVisitByBooking.get(booking.id);
            const preVisitOutput = preVisit?.parsedOutput as
              | { urgency: "Low" | "Medium" | "High"; chiefComplaint: string; questions: string[] }
              | undefined;
            const postVisit = booking.prescription ? postVisitByPrescription.get(booking.prescription.id) : undefined;
            const postVisitOutput = postVisit?.parsedOutput as
              | { summary: string; medicationSchedule: { medication: string; dosage: string; schedule: string }[]; followUpSteps: string[] }
              | undefined;
            const canCancel = booking.status === "CONFIRMED" && booking.startsAt.getTime() > now;

            return (
              <Card key={booking.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-display font-semibold text-ink">Dr. {booking.doctorProfile.user.name}</p>
                    <p className="text-sm text-ink-muted">{booking.doctorProfile.specialisation}</p>
                    <p className="font-tabular text-sm text-ink mt-1">
                      {formatClinicDateTime(booking.startsAt, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={booking.status} />
                    {canCancel && <CancelAppointmentButton bookingId={booking.id} />}
                  </div>
                </div>

                {preVisitOutput && booking.status === "CONFIRMED" && (
                  <div className="mt-4 rounded-md border border-line bg-paper px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-ink">Pre-visit summary</p>
                      <UrgencyBadge urgency={preVisitOutput.urgency} />
                    </div>
                    <p className="text-sm text-ink-muted">{preVisitOutput.chiefComplaint}</p>
                    <AiDisclosure />
                  </div>
                )}

                {booking.status === "COMPLETED" && postVisitOutput && (
                  <div className="mt-4 rounded-md border border-line bg-paper px-4 py-3">
                    <p className="text-sm font-medium text-ink mb-1">Visit summary</p>
                    <p className="text-sm text-ink-muted">{postVisitOutput.summary}</p>
                    {postVisitOutput.medicationSchedule.length > 0 && (
                      <table className="w-full mt-3 text-sm">
                        <thead>
                          <tr className="text-left text-ink-muted border-b border-line">
                            <th className="pb-1 font-medium">Medication</th>
                            <th className="pb-1 font-medium">Dosage</th>
                            <th className="pb-1 font-medium">Schedule</th>
                          </tr>
                        </thead>
                        <tbody className="font-tabular">
                          {postVisitOutput.medicationSchedule.map((m, i) => (
                            <tr key={i} className="border-b border-line/50 last:border-0">
                              <td className="py-1.5">{m.medication}</td>
                              <td className="py-1.5">{m.dosage}</td>
                              <td className="py-1.5">{m.schedule}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {postVisitOutput.followUpSteps.length > 0 && (
                      <ul className="mt-3 list-disc list-inside text-sm text-ink-muted space-y-0.5">
                        {postVisitOutput.followUpSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    )}
                    <AiDisclosure />
                    {booking.prescription && booking.prescription.items.length > 0 && (
                      <MedicationReminders items={booking.prescription.items} />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
