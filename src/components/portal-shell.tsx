"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface NavLink {
  href: string;
  label: string;
}

export function PortalShell({
  portalName,
  userName,
  links,
  children,
}: {
  portalName: string;
  userName: string;
  links: NavLink[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-paper-raised">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <span className="font-display font-semibold text-ink">{portalName}</span>
            <nav className="flex gap-1" aria-label="Primary">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      active ? "bg-clinical text-white" : "text-ink hover:bg-paper"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted hidden sm:inline">{userName}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm font-medium text-ink underline underline-offset-2 hover:text-clinical"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
