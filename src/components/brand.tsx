import type { ReactNode } from "react";

/* The institution. A well-funded hospital system has a name and a mark; the
   old build had neither, which is part of why it read as an internal tool.
   "Meridian Health" — used across Register A and the portal shells. */

export const INSTITUTION = "Meridian Health";

export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md bg-clinical font-display font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.52 }}
      aria-hidden="true"
    >
      M
    </span>
  );
}

export function Wordmark({
  size = 32,
  tone = "ink",
  suffix,
  className = "",
}: {
  size?: number;
  tone?: "ink" | "inverse";
  suffix?: ReactNode;
  className?: string;
}) {
  const name = tone === "inverse" ? "text-surface-raised" : "text-ink-900";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={size} />
      <span className="font-display font-semibold tracking-[-0.01em]" style={{ fontSize: size * 0.5 }}>
        <span className={name}>{INSTITUTION}</span>
        {suffix && <span className="text-ink-500"> {suffix}</span>}
      </span>
    </span>
  );
}
