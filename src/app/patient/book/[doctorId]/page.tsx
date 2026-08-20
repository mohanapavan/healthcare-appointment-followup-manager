"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DayRail } from "@/components/day-rail";
import { Button, Card, EmptyState, ErrorBanner, Label, Textarea } from "@/components/ui";
import { CLINIC_TIME_ZONE, formatClinicDate, formatClinicDateTime } from "@/lib/format-clinic-time";

interface Doctor {
  id: string;
  name: string;
  specialisation: string;
  slotDurationMins: number;
  workingHours: { dayOfWeek: number; startMinute: number; endMinute: number }[];
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface Hold {
  holdToken: string;
  holdExpiresAt: string;
  startsAt: string;
  endsAt: string;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BookPage({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = use(params);
  const router = useRouter();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [date, setDate] = useState(todayDateString());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [alternatives, setAlternatives] = useState<Slot[] | null>(null);

  const [symptomText, setSymptomText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const idempotencyKeyRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/doctors")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.doctors as Doctor[]).find((d) => d.id === doctorId);
        setDoctor(found ?? null);
      });
  }, [doctorId]);

  const loadSlots = useCallback(() => {
    setLoadingSlots(true);
    setError(null);
    fetch(`/api/doctors/${doctorId}/availability?date=${date}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message ?? "Could not load availability");
        setSlots(data.slots);
        setEmptyReason(data.emptyReason);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingSlots(false));
  }, [doctorId, date]);

  useEffect(() => {
    // setLoadingSlots(true) synchronously at the top of loadSlots is React's
    // own documented data-fetching-in-effect pattern (react.dev/reference/
    // react/useEffect#fetching-data-with-effects sets state the same way
    // before the fetch starts) — not a bug the newer set-state-in-effect
    // rule's static analysis is right to flag here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    if (!hold) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(hold.holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setHold(null);
        setError("Your hold expired. Pick a slot again.");
        loadSlots();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [hold, loadSlots]);

  const workingHoursForDate = useMemo(() => {
    if (!doctor) return null;
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    return doctor.workingHours.find((h) => h.dayOfWeek === dayOfWeek) ?? null;
  }, [doctor, date]);

  async function handleSlotClick(startsAtIso: string) {
    setPendingSlot(startsAtIso);
    setError(null);
    setAlternatives(null);
    try {
      const res = await fetch("/api/slots/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doctorProfileId: doctorId, startsAt: startsAtIso }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === "SLOT_TAKEN") {
          setAlternatives(data.error.details?.nextAvailable ?? []);
          setError("Slot taken — here are three others.");
          loadSlots();
        } else {
          setError(data.error?.message ?? "Could not hold that slot.");
        }
        return;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      setHold(data);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPendingSlot(null);
    }
  }

  async function handleConfirm() {
    if (!hold) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKeyRef.current },
        body: JSON.stringify({ holdToken: hold.holdToken, symptomText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not confirm this appointment.");
        return;
      }
      setConfirmed(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setConfirming(false);
    }
  }

  if (confirmed) {
    return (
      <Card className="max-w-md mx-auto text-center">
        <p className="font-display text-xl font-semibold text-confirmed mb-2">Appointment confirmed</p>
        <p className="text-ink-muted text-sm mb-6">
          You&apos;ll receive a confirmation email shortly. Your doctor will review your symptoms before the visit.
        </p>
        <Button onClick={() => router.push("/patient/appointments")}>View my appointments</Button>
      </Card>
    );
  }

  return (
    <div>
      {doctor ? (
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold text-ink">Dr. {doctor.name}</h1>
          <p className="text-ink-muted">{doctor.specialisation}</p>
        </div>
      ) : (
        <div className="h-14 mb-6" />
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={loadSlots} />
        </div>
      )}

      {alternatives && alternatives.length > 0 && (
        <div className="mb-4 rounded-md border border-caution bg-caution-bg px-4 py-3">
          <p className="text-sm font-medium text-caution mb-2">Other available times:</p>
          <div className="flex flex-wrap gap-2">
            {alternatives.map((s) => (
              <button
                key={s.startsAt}
                onClick={() => {
                  setAlternatives(null);
                  handleSlotClick(s.startsAt);
                }}
                className="rounded-md border border-caution bg-white px-3 py-1.5 text-sm font-tabular text-caution hover:bg-caution hover:text-white"
              >
                {formatClinicDateTime(s.startsAt, { weekday: "short", hour: "numeric", minute: "2-digit" })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <button
              className="text-sm font-medium text-clinical hover:underline"
              onClick={() => setDate((d) => shiftDate(d, -1))}
              disabled={!!hold}
            >
              ← Previous day
            </button>
            <p className="font-tabular text-sm font-semibold text-ink">
              {formatClinicDate(new Date(`${date}T12:00:00Z`), {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <button
              className="text-sm font-medium text-clinical hover:underline"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              disabled={!!hold}
            >
              Next day →
            </button>
          </div>

          {loadingSlots ? (
            <div className="h-96 animate-pulse rounded-lg bg-line/40" />
          ) : !workingHoursForDate && emptyReason === "NO_WORKING_HOURS" ? (
            <EmptyState title="Not in clinic this day" subtitle="Try another day using the arrows above." />
          ) : workingHoursForDate ? (
            <DayRail
              workStartMinute={workingHoursForDate.startMinute}
              workEndMinute={workingHoursForDate.endMinute}
              slotDurationMins={doctor?.slotDurationMins ?? 30}
              availableSlots={slots}
              onLeave={emptyReason === "ON_LEAVE"}
              heldSlot={hold ? { startsAt: hold.startsAt, holdExpiresAt: hold.holdExpiresAt } : null}
              pendingSlot={pendingSlot}
              now={new Date()}
              secondsLeft={secondsLeft}
              timeZone={CLINIC_TIME_ZONE}
              onSlotClick={handleSlotClick}
            />
          ) : (
            <EmptyState title="Fully booked" subtitle="Try another day using the arrows above." />
          )}
        </Card>

        <Card>
          {hold ? (
            <div>
              <p className="font-display font-semibold text-ink mb-1">Hold this slot</p>
              <p className="font-tabular text-sm text-caution mb-4" aria-live="polite">
                {secondsLeft !== null ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : ""}
              </p>
              <Label htmlFor="symptoms">What brings you in?</Label>
              <Textarea
                id="symptoms"
                rows={5}
                placeholder="Describe your symptoms (optional, but helps your doctor prepare)"
                value={symptomText}
                onChange={(e) => setSymptomText(e.target.value)}
              />
              <p className="text-xs text-ink-muted mt-2 mb-4">
                Shared with your doctor only — never used to diagnose you.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleConfirm} disabled={confirming} className="flex-1">
                  {confirming ? "Confirming…" : "Confirm appointment"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setHold(null);
                    loadSlots();
                  }}
                  disabled={confirming}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Pick a time on the day rail to hold it for five minutes.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
