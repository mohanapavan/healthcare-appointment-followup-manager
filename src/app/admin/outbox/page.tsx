import { prisma } from "@/lib/prisma";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AnimatedNumber } from "@/components/motion";
import { AlertTriangle, Check, RefreshCw } from "@/components/icons";
import { RetryButton } from "./retry-button";

const COUNTERS = [
  { status: "PENDING", label: "Pending" },
  { status: "SENT", label: "Sent" },
  { status: "FAILED", label: "Dead-lettered" },
  { status: "CANCELLED", label: "Cancelled" },
] as const;

export default async function AdminOutboxPage() {
  const [counts, failed] = await Promise.all([
    prisma.outboxEvent.groupBy({ by: ["status"], _count: true }),
    prisma.outboxEvent.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;
  const failedCount = countByStatus.FAILED ?? 0;

  return (
    <div>
      <PageHeader
        title="Outbox health"
        subtitle="Email, calendar, and AI-generation dispatch. Failures surface here — never silent."
      />

      {failedCount > 0 && (
        <div className="mb-6 flex items-center gap-2.5 rounded-md border border-urgent-line bg-urgent-wash px-4 py-3 text-sm font-semibold text-urgent">
          <AlertTriangle width={16} height={16} />
          {failedCount} event{failedCount === 1 ? "" : "s"} dead-lettered — needs attention.
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COUNTERS.map(({ status, label }) => {
          const value = countByStatus[status] ?? 0;
          const alert = status === "FAILED" && value > 0;
          const tone =
            status === "SENT" ? "text-confirmed" : alert ? "text-urgent" : "text-ink-900";
          return (
            <Card
              key={status}
              className={alert ? "border-urgent-line bg-urgent-wash" : undefined}
            >
              <div className={`numeral text-4xl ${tone}`}>
                <AnimatedNumber value={value} />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-ink-500">
                {status === "SENT" && <Check width={12} height={12} className="text-confirmed" />}
                {alert && <AlertTriangle width={12} height={12} className="text-urgent" />}
                {label}
              </div>
              {alert && <div className="mt-1 text-xs font-semibold text-urgent">needs attention</div>}
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Dead-letter queue</h2>
      {failed.length === 0 ? (
        <EmptyState
          title="Nothing dead-lettered"
          subtitle="Every outbox event has sent or is still retrying on backoff."
          illustration={<Check width={40} height={40} strokeWidth={1.25} className="text-confirmed" />}
        />
      ) : (
        <div className="space-y-2.5">
          {failed.map((event) => (
            <Card key={event.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <RefreshCw width={14} height={14} className="text-ink-400" />
                    <p className="font-medium text-ink-900">{event.type.replaceAll("_", " ")}</p>
                    <span className="font-tabular text-xs text-ink-500">· {event.attempts} attempts</span>
                  </div>
                  <p className="mt-1 font-tabular text-xs text-ink-400">
                    last failed {event.updatedAt.toLocaleString()}
                  </p>
                  {event.lastError && (
                    <p className="mt-2 rounded border border-urgent-line bg-urgent-wash px-2.5 py-1.5 font-tabular text-xs break-all text-urgent">
                      {event.lastError.slice(0, 200)}
                    </p>
                  )}
                </div>
                <RetryButton eventId={event.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
