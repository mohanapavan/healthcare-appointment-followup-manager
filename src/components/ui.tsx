import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle } from "./icons";

/* ---------------------------------------------------------------------------
   Shared primitives (§8 step 2). Server-safe — no hooks, no "use client" — so
   they render in server components. Interactive/motion primitives (Sheet,
   AnimatedNumber, staggered reveals) live in ./motion.tsx.
   Everything derives from the tokens in globals.css.
   --------------------------------------------------------------------------- */

// ---- Surfaces --------------------------------------------------------------

export function Card({
  children,
  className = "",
  elevation = 1,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  elevation?: 1 | 2 | 3;
  as?: "div" | "section" | "article";
}) {
  const elev = { 1: "shadow-elev-1", 2: "shadow-elev-2", 3: "shadow-elev-3" }[elevation];
  return (
    <Tag
      className={`rounded-lg border border-ink-line bg-surface-raised ${elev} p-5 sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  );
}

/** A recessed grouping surface used *inside* cards — sits below the card, not above. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-ink-line bg-surface-base p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Hairline({ className = "" }: { className?: string }) {
  return <hr className={`border-0 h-px bg-ink-line ${className}`} />;
}

/** The one indulgence (§2.4) — Register A only. An engraved plaque line. */
export function BrassRule({ className = "" }: { className?: string }) {
  return <hr className={`brass-rule ${className}`} aria-hidden="true" />;
}

// ---- The signature: oversized tabular numerals -----------------------------

const STAT_SIZE = {
  md: "text-4xl",
  lg: "text-5xl",
  xl: "text-6xl",
} as const;

/** A big number that carries meaning at size (§3). Static; the animated
    number-roll variant is AnimatedNumber in ./motion.tsx. */
export function Stat({
  value,
  label,
  unit,
  size = "md",
  tone = "ink",
  className = "",
}: {
  value: ReactNode;
  label?: ReactNode;
  unit?: string;
  size?: keyof typeof STAT_SIZE;
  tone?: "ink" | "clinical" | "urgent" | "confirmed" | "inverse";
  className?: string;
}) {
  const toneClass = {
    ink: "text-ink-900",
    clinical: "text-clinical",
    urgent: "text-urgent",
    confirmed: "text-confirmed",
    inverse: "text-surface-raised",
  }[tone];
  return (
    <div className={className}>
      <div className={`numeral ${STAT_SIZE[size]} ${toneClass} flex items-baseline gap-1.5`}>
        <span>{value}</span>
        {unit && <span className="text-[0.4em] font-body font-medium tracking-normal text-ink-500">{unit}</span>}
      </div>
      {label && (
        <div className="mt-1.5 text-xs font-medium uppercase tracking-[0.08em] text-ink-500">{label}</div>
      )}
    </div>
  );
}

// ---- Buttons ---------------------------------------------------------------

const BTN_SIZE = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  size?: keyof typeof BTN_SIZE;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0";
  const variants: Record<string, string> = {
    primary: "bg-clinical text-white shadow-elev-1 hover:bg-clinical-deep",
    secondary:
      "bg-surface-overlay text-ink-900 border border-ink-line-strong shadow-elev-1 hover:border-clinical hover:text-clinical",
    destructive: "bg-transparent text-urgent border border-urgent-line hover:bg-urgent-wash",
    ghost: "bg-transparent text-ink-700 hover:bg-surface-base",
  };
  return <button className={`${base} ${BTN_SIZE[size]} ${variants[variant]} ${className}`} {...props} />;
}

// ---- Badges: urgency & status ----------------------------------------------

const URGENCY: Record<string, { wrap: string; label: string; icon: boolean; weight: string }> = {
  // Urgency is label + weight + shape + color — never color alone (§0).
  High: { wrap: "bg-urgent text-white", label: "High", icon: true, weight: "font-bold" },
  Medium: { wrap: "bg-surface-overlay text-caution border border-caution-line", label: "Medium", icon: false, weight: "font-semibold" },
  Low: { wrap: "bg-surface-overlay text-confirmed border border-confirmed-line", label: "Low", icon: false, weight: "font-medium" },
};

export function UrgencyBadge({ urgency }: { urgency: "Low" | "Medium" | "High" }) {
  const s = URGENCY[urgency];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs ${s.weight} ${s.wrap}`}
    >
      {s.icon && <AlertTriangle width={12} height={12} strokeWidth={2.5} />}
      <span className="uppercase tracking-[0.04em]">Urgency: {s.label}</span>
    </span>
  );
}

const STATUS: Record<string, { dot: string; text: string }> = {
  HELD: { dot: "bg-caution", text: "text-caution" },
  CONFIRMED: { dot: "bg-confirmed", text: "text-confirmed" },
  COMPLETED: { dot: "bg-ink-400", text: "text-ink-500" },
  CANCELLED_BY_PATIENT: { dot: "bg-ink-400", text: "text-ink-500" },
  CANCELLED_BY_CLINIC: { dot: "bg-urgent", text: "text-urgent" },
  NO_SHOW: { dot: "bg-urgent", text: "text-urgent" },
  EXPIRED: { dot: "bg-ink-400", text: "text-ink-500" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.EXPIRED;
  const label = status.replaceAll("_", " ").toLowerCase();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border border-ink-line bg-surface-base px-2 py-0.5 text-xs font-medium capitalize ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

// ---- Feedback --------------------------------------------------------------

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-md border border-urgent-line bg-urgent-wash px-4 py-3 text-sm text-urgent"
      role="alert"
    >
      <span className="flex items-center gap-2 font-medium">
        <AlertTriangle width={16} height={16} className="shrink-0" />
        {message}
      </span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline field error, under the input, icon + text (§6.2). */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-urgent">
      <AlertTriangle width={13} height={13} className="shrink-0" />
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
  illustration,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-ink-line bg-surface-raised px-6 py-14 text-center shadow-elev-1">
      {illustration && <div className="mb-5 text-ink-400">{illustration}</div>}
      <p className="font-display text-lg font-medium text-ink-900">{title}</p>
      {subtitle && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** A few skeleton lines that shrink like real text. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-3.5" style={{ width: i === lines - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}

export function AiDisclosure({ source }: { source?: "LLM" | "FALLBACK" }) {
  return (
    <p className="mt-3 border-t border-ink-line pt-2 text-xs text-ink-500">
      {source === "FALLBACK" && (
        <span className="mr-1.5 font-medium text-caution">Rules-based summary —</span>
      )}
      AI-generated, reviewed by your doctor.
    </p>
  );
}

// ---- Forms -----------------------------------------------------------------

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-700">
      {children}
    </label>
  );
}

const FIELD =
  "w-full rounded-md border border-ink-line-strong bg-surface-overlay px-3.5 py-2.5 text-sm text-ink-900 shadow-elev-1 placeholder:text-ink-400 focus:border-clinical focus:outline-none";

export function Input({ invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`${FIELD} ${invalid ? "border-urgent" : ""} ${props.className ?? ""}`}
    />
  );
}

export function Textarea({ invalid, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={`${FIELD} ${invalid ? "border-urgent" : ""} ${props.className ?? ""}`}
    />
  );
}

// ---- Page header -----------------------------------------------------------

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Small uppercase eyebrow label used above section headings. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 ${className}`}>
      {children}
    </p>
  );
}
