"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RetryButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    setLoading(true);
    await fetch(`/api/admin/outbox/${eventId}/retry`, { method: "POST" });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button variant="secondary" onClick={handleRetry} disabled={loading}>
      {loading ? "Retrying…" : "Retry"}
    </Button>
  );
}
