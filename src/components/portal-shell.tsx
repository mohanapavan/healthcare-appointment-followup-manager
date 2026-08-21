"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Mark, INSTITUTION } from "./brand";

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
  // Longest-prefix match, so a parent item (e.g. /patient) isn't also marked
  // active when a sibling child route (/patient/appointments) is the real match.
  const activeHref = links
    .filter((l) => pathname === l.href || pathname.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-ink-line bg-surface-raised/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <Mark size={30} />
              <div className="hidden leading-tight sm:block">
                <div className="font-display text-sm font-semibold tracking-[-0.01em] text-ink-900">{INSTITUTION}</div>
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">{portalName}</div>
              </div>
            </div>
            <nav className="flex gap-1" aria-label="Primary">
              {links.map((link) => {
                const active = link.href === activeHref;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-clinical text-white shadow-elev-1"
                        : "text-ink-700 hover:bg-surface-base hover:text-ink-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-ink-700 sm:inline">{userName}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md border border-ink-line bg-surface-overlay px-3 py-1.5 text-sm font-medium text-ink-700 shadow-elev-1 hover:border-clinical hover:text-clinical"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
