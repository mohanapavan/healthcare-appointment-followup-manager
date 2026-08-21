"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";
import { formatClinicDateTime } from "@/lib/format-clinic-time";

interface ExistingLeave {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

interface AffectedBooking {
  bookingId: string;
  patientName: string;
  startsAt: string;
}

export function LeaveManager({
  doctorProfileId,
  existingLeave,
}: {
  doctorProfileId: string;
  existingLeave: ExistingLeave[];
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePreview() {
    setError(null);
    setAffected(null);
    if (!startDate || !endDate || !reason.trim()) {
      setError("Start date, end date, and reason are all required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/doctors/${doctorProfileId}/leave/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not preview this range.");
        return;
      }
      setAffected(data.affected);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctors/${doctorProfileId}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not create this leave.");
        return;
      }
      setAffected(null);
      setStartDate("");
      setEndDate("");
      setReason("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(leaveId: string) {
    await fetch(`/api/doctors/${doctorProfileId}/leave/${leaveId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <p className="font-display font-semibold text-ink mb-3">Request leave</p>
        {error && (
          <div className="mb-3">
            <ErrorBanner message={error} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <Label htmlFor="reason">Reason</Label>
        <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conference, personal leave, etc." />

        {affected === null ? (
          <Button className="mt-4" onClick={handlePreview} disabled={loading}>
            {loading ? "Checking…" : "Preview impact"}
          </Button>
        ) : (
          <div className="mt-4">
            {affected.length === 0 ? (
              <p className="text-sm text-confirmed mb-3">No appointments are affected.</p>
            ) : (
              <div className="mb-3 rounded-md border border-caution bg-caution-bg px-3 py-2">
                <p className="text-sm font-medium text-caution-ink mb-1">
                  {affected.length} appointment{affected.length === 1 ? "" : "s"} affected — each patient will be emailed with rebooking options.
                </p>
                <ul className="text-sm text-ink space-y-0.5 font-tabular">
                  {affected.map((b) => (
                    <li key={b.bookingId}>
                      {b.patientName} —{" "}
                      {formatClinicDateTime(b.startsAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? "Confirming…" : "Confirm leave"}
              </Button>
              <Button variant="secondary" onClick={() => setAffected(null)} disabled={loading}>
                Back
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <p className="font-display font-semibold text-ink mb-3">Upcoming leave</p>
        {existingLeave.length === 0 ? (
          <p className="text-sm text-ink-muted">No leave scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {existingLeave.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                <div className="text-sm">
                  <span className="font-tabular text-ink">
                    {l.startDate} → {l.endDate}
                  </span>
                  <span className="text-ink-muted ml-2">{l.reason}</span>
                </div>
                <button onClick={() => handleDelete(l.id)} className="text-xs font-medium text-urgent hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
