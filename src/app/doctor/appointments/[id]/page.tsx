import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatClinicDateTime } from "@/lib/format-clinic-time";
import { Card, Eyebrow, StatusBadge, UrgencyBadge, AiDisclosure } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { CompleteVisitForm } from "./complete-visit-form";

type PreVisit = { urgency: "Low" | "Medium" | "High"; chiefComplaint: string; questions: string[] };
type PostVisit = { summary: string; medicationSchedule: unknown[]; followUpSteps: string[] };

export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { patient: true, doctorProfile: true, symptomSubmission: true, prescription: { include: { items: true } } },
  });
  if (!booking || booking.doctorProfile.userId !== session.user.id) notFound();

  const preVisit = await prisma.aiGeneration.findFirst({
    where: { entityType: "BOOKING_PRE_VISIT", entityId: booking.id },
  });
  const pre = preVisit?.parsedOutput as PreVisit | undefined;

  const postVisit = booking.prescription
    ? await prisma.aiGeneration.findFirst({ where: { entityType: "PRESCRIPTION_POST_VISIT", entityId: booking.prescription.id } })
    : null;
  const post = postVisit?.parsedOutput as PostVisit | undefined;

  return (
    <div>
      <Link href="/doctor" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-clinical">
        <ChevronLeft width={16} height={16} /> Day sheet
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{booking.patient.name}</h1>
          <p className="mt-1 font-tabular text-sm text-ink-500">
            {formatClinicDateTime(booking.startsAt, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pre && <UrgencyBadge urgency={pre.urgency} />}
          <StatusBadge status={booking.status} />
        </div>
      </div>

      <div className="space-y-4">
        {/* Pre-visit summary — the brass-ruled AI surface. */}
        <Card className="border-l-2 border-l-brass">
          <p className="mb-3 font-display font-semibold text-ink-900">Pre-visit summary</p>
          {booking.symptomSubmission ? (
            <>
              <div className="rounded-md bg-surface-base px-4 py-3">
                <Eyebrow className="mb-1">Patient reported</Eyebrow>
                <p className="text-sm text-ink-700">{booking.symptomSubmission.symptomText || "(no details provided)"}</p>
              </div>
              {pre ? (
                <div className="mt-4">
                  <p className="text-sm text-ink-700">{pre.chiefComplaint}</p>
                  <Eyebrow className="mb-2 mt-4">Suggested questions</Eyebrow>
                  <ol className="space-y-1.5">
                    {pre.questions.map((q, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ink-700">
                        <span className="font-tabular font-semibold text-clinical">{i + 1}.</span>
                        {q}
                      </li>
                    ))}
                  </ol>
                  <AiDisclosure source={preVisit?.source} />
                </div>
              ) : (
                <p className="mt-3 text-sm italic text-ink-500">Summary is being generated…</p>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-500">No symptom form was submitted.</p>
          )}
        </Card>

        {booking.status === "CONFIRMED" && (
          <Card className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-ink-900">Ready to wrap up?</p>
              <p className="text-sm text-ink-500">Record clinical notes and a prescription to complete this visit.</p>
            </div>
            <CompleteVisitForm bookingId={booking.id} />
          </Card>
        )}

        {booking.status === "COMPLETED" && booking.prescription && (
          <Card>
            <p className="mb-3 font-display font-semibold text-ink-900">Visit notes &amp; prescription</p>
            <p className="mb-4 whitespace-pre-wrap text-sm text-ink-700">{booking.prescription.clinicalNotes}</p>
            {booking.prescription.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-line text-left text-ink-500">
                      <th className="pb-2 font-medium">Medication</th>
                      <th className="pb-2 font-medium">Dosage</th>
                      <th className="pb-2 font-medium">Frequency</th>
                      <th className="pb-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="font-tabular text-ink-700">
                    {booking.prescription.items.map((item) => (
                      <tr key={item.id} className="border-b border-ink-line last:border-0">
                        <td className="py-2 font-body font-medium text-ink-900">{item.medicationName}</td>
                        <td className="py-2">{item.dosage}</td>
                        <td className="py-2">{item.timesPerDay}×/day</td>
                        <td className="py-2">{item.durationDays}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {post && (
              <div className="mt-4 border-t border-ink-line pt-4">
                <Eyebrow className="mb-1">Patient-facing summary</Eyebrow>
                <p className="text-sm text-ink-700">{post.summary}</p>
                <AiDisclosure source={postVisit?.source} />
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
