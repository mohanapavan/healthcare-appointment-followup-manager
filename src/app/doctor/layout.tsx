import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "DOCTOR") redirect("/");

  return (
    <PortalShell
      portalName="Doctor Portal"
      userName={session.user.name ?? ""}
      links={[
        { href: "/doctor", label: "Today" },
        { href: "/doctor/leave", label: "Leave" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
