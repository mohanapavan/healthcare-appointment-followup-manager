"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorBanner, Input, Label, Textarea } from "@/components/ui";
import { Sheet, motion, AnimatePresence, SPRING } from "@/components/motion";
import { Pill, X } from "@/components/icons";

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
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Complete visit</Button>

      <Sheet open={open} onClose={() => (submitting ? undefined : setOpen(false))} title="Complete visit" width={480}>
        {error && (
          <div className="mb-4">
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

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
              <Pill width={15} height={15} className="text-clinical" /> Prescription
            </p>
            <span className="font-tabular text-xs text-ink-500">{items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>

          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {items.map((item, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                  transition={SPRING}
                  className="rounded-md border border-ink-line bg-surface-base p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-500">
                      Medication {i + 1}
                    </span>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove medication ${i + 1}`}
                      className="rounded p-1 text-ink-400 hover:bg-urgent-wash hover:text-urgent"
                    >
                      <X width={14} height={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label htmlFor={`med-${i}`}>Name</Label>
                      <Input id={`med-${i}`} value={item.medicationName} onChange={(e) => updateItem(i, { medicationName: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor={`dose-${i}`}>Dosage</Label>
                      <Input id={`dose-${i}`} value={item.dosage} onChange={(e) => updateItem(i, { dosage: e.target.value })} placeholder="e.g. 500mg" />
                    </div>
                    <div>
                      <Label htmlFor={`freq-${i}`}>Times/day</Label>
                      <Input id={`freq-${i}`} type="number" min={1} max={12} value={item.timesPerDay} onChange={(e) => updateItem(i, { timesPerDay: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label htmlFor={`dur-${i}`}>Days</Label>
                      <Input id={`dur-${i}`} type="number" min={1} max={365} value={item.durationDays} onChange={(e) => updateItem(i, { durationDays: Number(e.target.value) })} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <Button variant="secondary" size="sm" className="mt-2.5" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}>
            + Add medication
          </Button>
        </div>

        <div className="mt-6 flex gap-2 border-t border-ink-line pt-4">
          <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Completing…" : "Complete visit"}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}
