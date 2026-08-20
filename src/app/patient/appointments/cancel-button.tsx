"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function CancelAppointmentButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Cancel
      </Button>
    );
  }

  async function handleCancel() {
    setLoading(true);
    await fetch(`/api/appointments/${bookingId}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Cancelled by patient" }),
    });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-muted">Cancel this appointment?</span>
      <Button variant="destructive" onClick={handleCancel} disabled={loading}>
        {loading ? "Cancelling…" : "Yes, cancel"}
      </Button>
      <Button variant="secondary" onClick={() => setConfirming(false)} disabled={loading}>
        Keep it
      </Button>
    </div>
  );
}
