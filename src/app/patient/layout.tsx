import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "PATIENT") redirect("/");

  return (
    <PortalShell
      portalName="Patient Portal"
      userName={session.user.name ?? ""}
      links={[
        { href: "/patient", label: "Find a doctor" },
        { href: "/patient/appointments", label: "My appointments" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
