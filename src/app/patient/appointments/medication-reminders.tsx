"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { formatClinicDateTime } from "@/lib/format-clinic-time";

interface Reminder {
  id: string;
  status: string;
  dueAt: string;
}

export function MedicationReminders({ items }: { items: { id: string; medicationName: string }[] }) {
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-2">
      <p className="text-sm font-medium text-ink">Medication reminders</p>
      {items.map((item) => (
        <MedicationReminderRow key={item.id} itemId={item.id} name={item.medicationName} />
      ))}
    </div>
  );
}

function MedicationReminderRow({ itemId, name }: { itemId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [stopping, setStopping] = useState(false);

  async function toggle() {
    if (!open && !reminders) {
      const res = await fetch(`/api/prescription-items/${itemId}/reminders`);
      const data = await res.json();
      setReminders(data.reminders);
    }
    setOpen((o) => !o);
  }

  async function stop() {
    setStopping(true);
    await fetch(`/api/prescription-items/${itemId}/reminders/stop`, { method: "POST" });
    const res = await fetch(`/api/prescription-items/${itemId}/reminders`);
    const data = await res.json();
    setReminders(data.reminders);
    setStopping(false);
  }

  const pendingCount = reminders?.filter((r) => r.status === "PENDING").length ?? null;

  return (
    <div className="rounded-md border border-line px-3 py-2">
      <button onClick={toggle} className="flex items-center justify-between w-full text-sm text-left">
        <span className="text-ink">{name}</span>
        <span className="text-clinical text-xs font-medium">{open ? "Hide schedule" : "View schedule"}</span>
      </button>
      {open && reminders && (
        <div className="mt-2">
          <ul className="font-tabular text-xs text-ink-muted space-y-1 max-h-32 overflow-y-auto">
            {reminders.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>
                  {formatClinicDateTime(r.dueAt, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className={r.status === "CANCELLED" ? "line-through" : ""}>{r.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
          {pendingCount !== null && pendingCount > 0 && (
            <Button variant="secondary" className="mt-2" onClick={stop} disabled={stopping}>
              {stopping ? "Stopping…" : `Stop remaining reminders (${pendingCount})`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
