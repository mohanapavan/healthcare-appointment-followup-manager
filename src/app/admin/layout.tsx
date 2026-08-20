import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <PortalShell
      portalName="Admin"
      userName={session.user.name ?? ""}
      links={[
        { href: "/admin", label: "Doctors" },
        { href: "/admin/outbox", label: "Outbox health" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
