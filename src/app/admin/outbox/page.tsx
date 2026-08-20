import { prisma } from "@/lib/prisma";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { RetryButton } from "./retry-button";

export default async function AdminOutboxPage() {
  const [counts, failed] = await Promise.all([
    prisma.outboxEvent.groupBy({ by: ["status"], _count: true }),
    prisma.outboxEvent.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div>
      <PageHeader title="Outbox health" subtitle="Email, calendar, and AI-generation dispatch — failures are visible here, never silent." />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {(["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"] as const).map((status) => (
          <Card key={status} className="text-center">
            <p className="font-tabular text-2xl font-semibold text-ink">{countByStatus[status] ?? 0}</p>
            <p className="text-xs text-ink-muted mt-1 capitalize">{status.toLowerCase()}</p>
          </Card>
        ))}
      </div>

      <h2 className="font-display text-lg font-semibold text-ink mb-3">Dead-lettered (failed 5 times)</h2>
      {failed.length === 0 ? (
        <EmptyState title="Nothing dead-lettered" subtitle="Every outbox event has either sent or is still retrying." />
      ) : (
        <div className="space-y-2">
          {failed.map((event) => (
            <Card key={event.id}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-ink">{event.type.replaceAll("_", " ")}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {event.attempts} attempts · last failed {event.updatedAt.toLocaleString()}
                  </p>
                  {event.lastError && (
                    <p className="text-xs text-urgent mt-1 font-tabular break-all">{event.lastError.slice(0, 200)}</p>
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
