"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label, Textarea } from "@/components/ui";

interface PrescriptionItemDraft {
  medicationName: string;
  dosage: string;
  timesPerDay: number;
  durationDays: number;
  instructions: string;
}

const EMPTY_ITEM: PrescriptionItemDraft = {
  medicationName: "",
  dosage: "",
  timesPerDay: 1,
  durationDays: 5,
  instructions: "",
};

export function CompleteVisitForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [items, setItems] = useState<PrescriptionItemDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(index: number, patch: Partial<PrescriptionItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleSubmit() {
    if (!clinicalNotes.trim()) {
      setError("Clinical notes are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${bookingId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clinicalNotes,
          prescriptionItems: items
            .filter((it) => it.medicationName.trim())
            .map((it) => ({ ...it, instructions: it.instructions || undefined })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not complete this visit.");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <p className="font-display font-semibold text-ink mb-3">Complete visit</p>
      {error && (
        <div className="mb-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <Label htmlFor="clinicalNotes">Clinical notes</Label>
      <Textarea
        id="clinicalNotes"
        rows={4}
        value={clinicalNotes}
        onChange={(e) => setClinicalNotes(e.target.value)}
        placeholder="Diagnosis, findings, treatment plan…"
      />

      <div className="mt-4">
        <p className="text-sm font-medium text-ink mb-2">Prescription</p>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md border border-line p-3">
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor={`med-${i}`}>Medication</Label>
                <Input id={`med-${i}`} value={item.medicationName} onChange={(e) => updateItem(i, { medicationName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`dose-${i}`}>Dosage</Label>
                <Input id={`dose-${i}`} value={item.dosage} onChange={(e) => updateItem(i, { dosage: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`freq-${i}`}>Times/day</Label>
                <Input
                  id={`freq-${i}`}
                  type="number"
                  min={1}
                  max={12}
                  value={item.timesPerDay}
                  onChange={(e) => updateItem(i, { timesPerDay: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor={`dur-${i}`}>Days</Label>
                <Input
                  id={`dur-${i}`}
                  type="number"
                  min={1}
                  max={365}
                  value={item.durationDays}
                  onChange={(e) => updateItem(i, { durationDays: Number(e.target.value) })}
                />
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-2" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}>
          + Add medication
        </Button>
      </div>

      <Button className="mt-5" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Completing…" : "Complete visit"}
      </Button>
    </Card>
  );
}
