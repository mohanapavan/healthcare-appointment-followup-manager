import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { LeaveManager } from "./leave-manager";

export default async function DoctorLeavePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: session.user.id } });
  if (!doctorProfile) redirect("/doctor");

  const leave = await prisma.leave.findMany({
    where: { doctorProfileId: doctorProfile.id },
    orderBy: { startDate: "asc" },
  });

  return (
    <div>
      <PageHeader title="Leave" subtitle="Marking a range as leave cancels any bookings inside it — you'll see exactly what before confirming." />
      <LeaveManager
        doctorProfileId={doctorProfile.id}
        existingLeave={leave.map((l) => ({
          id: l.id,
          startDate: l.startDate.toISOString().slice(0, 10),
          endDate: l.endDate.toISOString().slice(0, 10),
          reason: l.reason,
        }))}
      />
    </div>
  );
}
