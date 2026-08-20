import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatClinicDateTime } from "@/lib/format-clinic-time";
import { Card, PageHeader, StatusBadge, UrgencyBadge, AiDisclosure } from "@/components/ui";
import { CompleteVisitForm } from "./complete-visit-form";

export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      patient: true,
      doctorProfile: true,
      symptomSubmission: true,
      prescription: { include: { items: true } },
    },
  });
  if (!booking || booking.doctorProfile.userId !== session.user.id) notFound();

  const preVisit = await prisma.aiGeneration.findFirst({
    where: { entityType: "BOOKING_PRE_VISIT", entityId: booking.id },
  });
  const preVisitOutput = preVisit?.parsedOutput as
    | { urgency: "Low" | "Medium" | "High"; chiefComplaint: string; questions: string[] }
    | undefined;

  const postVisit = booking.prescription
    ? await prisma.aiGeneration.findFirst({
        where: { entityType: "PRESCRIPTION_POST_VISIT", entityId: booking.prescription.id },
      })
    : null;
  const postVisitOutput = postVisit?.parsedOutput as
    | { summary: string; medicationSchedule: { medication: string; dosage: string; schedule: string }[]; followUpSteps: string[] }
    | undefined;

  return (
    <div>
      <PageHeader
        title={booking.patient.name}
        subtitle={formatClinicDateTime(booking.startsAt, {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
        action={<StatusBadge status={booking.status} />}
      />

      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <p className="font-display font-semibold text-ink">Pre-visit summary</p>
            {preVisitOutput && <UrgencyBadge urgency={preVisitOutput.urgency} />}
          </div>
          {booking.symptomSubmission ? (
            <>
              <p className="text-sm text-ink-muted mb-3">
                <span className="font-medium text-ink">Patient reported: </span>
                {booking.symptomSubmission.symptomText || "(no details provided)"}
              </p>
              {preVisitOutput ? (
                <>
                  <p className="text-sm text-ink mb-2">{preVisitOutput.chiefComplaint}</p>
                  <p className="text-sm font-medium text-ink mb-1">Suggested questions:</p>
                  <ul className="list-disc list-inside text-sm text-ink-muted space-y-0.5">
                    {preVisitOutput.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                  <AiDisclosure />
                </>
              ) : (
                <p className="text-sm text-ink-muted italic">Summary is being generated…</p>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-muted">No symptom form was submitted.</p>
          )}
        </Card>

        {booking.status === "CONFIRMED" && <CompleteVisitForm bookingId={booking.id} />}

        {booking.status === "COMPLETED" && booking.prescription && (
          <Card>
            <p className="font-display font-semibold text-ink mb-2">Visit notes &amp; prescription</p>
            <p className="text-sm text-ink-muted whitespace-pre-wrap mb-3">{booking.prescription.clinicalNotes}</p>
            {booking.prescription.items.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-line">
                    <th className="pb-1 font-medium">Medication</th>
                    <th className="pb-1 font-medium">Dosage</th>
                    <th className="pb-1 font-medium">Frequency</th>
                    <th className="pb-1 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="font-tabular">
                  {booking.prescription.items.map((item) => (
                    <tr key={item.id} className="border-b border-line/50 last:border-0">
                      <td className="py-1.5">{item.medicationName}</td>
                      <td className="py-1.5">{item.dosage}</td>
                      <td className="py-1.5">{item.timesPerDay}x/day</td>
                      <td className="py-1.5">{item.durationDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {postVisitOutput && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-sm font-medium text-ink mb-1">Patient-facing summary</p>
                <p className="text-sm text-ink-muted">{postVisitOutput.summary}</p>
                <AiDisclosure />
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
