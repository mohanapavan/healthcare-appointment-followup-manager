import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "destructive" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-clinical text-white hover:bg-clinical-dark",
    secondary: "bg-transparent text-ink border border-line hover:bg-paper-raised",
    destructive: "bg-transparent text-urgent border border-urgent hover:bg-urgent-bg",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-paper-raised p-4 sm:p-6 ${className}`}>{children}</div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const URGENCY_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  Low: { bg: "bg-confirmed-bg", fg: "text-confirmed", label: "Low" },
  Medium: { bg: "bg-caution-bg", fg: "text-caution", label: "Medium" },
  High: { bg: "bg-urgent-bg", fg: "text-urgent", label: "High" },
};

export function UrgencyBadge({ urgency }: { urgency: "Low" | "Medium" | "High" }) {
  const s = URGENCY_STYLES[urgency];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.fg}`}
    >
      {urgency === "High" && <span aria-hidden="true">&#9650;</span>}
      Urgency: {s.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    HELD: "bg-caution-bg text-caution",
    CONFIRMED: "bg-confirmed-bg text-confirmed",
    COMPLETED: "bg-line text-ink-muted",
    CANCELLED_BY_PATIENT: "bg-line text-ink-muted",
    CANCELLED_BY_CLINIC: "bg-urgent-bg text-urgent",
    NO_SHOW: "bg-urgent-bg text-urgent",
    EXPIRED: "bg-line text-ink-muted",
  };
  const label = status.replaceAll("_", " ").toLowerCase();
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold capitalize ${styles[status] ?? "bg-line text-ink-muted"}`}>
      {label}
    </span>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-urgent bg-urgent-bg px-4 py-3 text-sm text-urgent flex items-center justify-between gap-4" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline font-medium shrink-0">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-lg font-medium text-ink">{title}</p>
      {subtitle && <p className="text-ink-muted mt-1 text-sm">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line/60 ${className}`} aria-hidden="true" />;
}

export function AiDisclosure() {
  return (
    <p className="text-xs text-ink-muted border-t border-line pt-2 mt-3">
      AI-generated, reviewed by your doctor.
    </p>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1">
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-clinical ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-clinical ${props.className ?? ""}`}
    />
  );
}
