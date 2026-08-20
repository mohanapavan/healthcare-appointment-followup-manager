"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function CreateDoctorForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [specialisation, setSpecialisation] = useState("");
  const [slotDurationMins, setSlotDurationMins] = useState(30);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/doctors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          specialisation,
          slotDurationMins,
          workingHours: days.map((dayOfWeek) => ({
            dayOfWeek,
            startMinute: toMinutes(startTime),
            endMinute: toMinutes(endTime),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not create doctor.");
        return;
      }
      setEmail("");
      setPassword("");
      setName("");
      setSpecialisation("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <p className="font-display font-semibold text-ink mb-3">Add a doctor</p>
      {error && (
        <div className="mb-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="space-y-3">
        <div>
          <Label htmlFor="d-name">Name</Label>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="d-email">Email</Label>
          <Input id="d-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="d-password">Temporary password</Label>
          <Input id="d-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="d-spec">Specialisation</Label>
          <Input id="d-spec" value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="d-slot">Slot duration (minutes)</Label>
          <Input
            id="d-slot"
            type="number"
            min={5}
            max={240}
            value={slotDurationMins}
            onChange={(e) => setSlotDurationMins(Number(e.target.value))}
          />
        </div>
        <div>
          <span className="block text-sm font-medium text-ink mb-1">Working days</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
            {DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={days.includes(d.value)}
                onClick={() => toggleDay(d.value)}
                className={`rounded px-2.5 py-1 text-xs font-medium border ${
                  days.includes(d.value) ? "bg-clinical text-white border-clinical" : "border-line text-ink-muted"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="d-start">Start time</Label>
            <Input id="d-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="d-end">End time</Label>
            <Input id="d-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      </div>
      <Button className="mt-4 w-full" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Creating…" : "Create doctor"}
      </Button>
    </Card>
  );
}
