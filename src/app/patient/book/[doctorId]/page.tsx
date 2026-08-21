"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DayRail, CountdownRing } from "@/components/day-rail";
import { DoctorPortrait, portraitSrc } from "@/components/doctor-portrait";
import { Button, Card, EmptyState, ErrorBanner, Eyebrow, Label, Skeleton, Textarea } from "@/components/ui";
import { Reveal, motion, AnimatePresence } from "@/components/motion";
import { Check, ChevronLeft, ChevronRight, Clock } from "@/components/icons";
import { CLINIC_TIME_ZONE, formatClinicDate, formatClinicDateTime, formatClinicTime } from "@/lib/format-clinic-time";

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
  const [conflictSlot, setConflictSlot] = useState<string | null>(null);
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
      .then((data) => setDoctor((data.doctors as Doctor[]).find((d) => d.id === doctorId) ?? null));
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
    // React's documented fetch-in-effect pattern; see original note in git history.
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

  const nextOpen = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return slots.find((s) => new Date(s.startsAt).getTime() > now) ?? slots[0] ?? null;
  }, [slots]);

  async function handleSlotClick(startsAtIso: string) {
    setPendingSlot(startsAtIso);
    setError(null);
    setAlternatives(null);
    setConflictSlot(null);
    try {
      const res = await fetch("/api/slots/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doctorProfileId: doctorId, startsAt: startsAtIso }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === "SLOT_TAKEN") {
          setConflictSlot(startsAtIso);
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
      <Reveal>
        <Card elevation={2} className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-confirmed-wash text-confirmed">
            <Check width={28} height={28} strokeWidth={2.5} />
          </div>
          <p className="font-display text-xl font-semibold text-ink-900">Appointment confirmed</p>
          <p className="mx-auto mt-2 mb-6 max-w-xs text-sm text-ink-500">
            A confirmation email is on its way. Your doctor will review your symptoms before the visit.
          </p>
          <Button onClick={() => router.push("/patient/appointments")}>View my appointments</Button>
        </Card>
      </Reveal>
    );
  }

  return (
    <div>
      <Link href="/patient" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-clinical">
        <ChevronLeft width={16} height={16} /> All doctors
      </Link>

      {/* Doctor header */}
      {doctor ? (
        <div className="mb-6 flex items-center gap-4">
          <DoctorPortrait name={doctor.name} src={portraitSrc(doctor.id)} size="lg" />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">Dr. {doctor.name}</h1>
            <p className="text-ink-500">{doctor.specialisation}</p>
            {nextOpen && (
              <p className="mt-1 flex items-center gap-1.5 font-tabular text-sm text-clinical">
                <Clock width={14} height={14} /> Next open {formatClinicTime(nextOpen.startsAt, { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-4">
          <Skeleton className="h-[72px] w-[72px] rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={loadSlots} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {/* The day rail — the star */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-clinical hover:bg-clinical-wash disabled:opacity-40"
              onClick={() => setDate((d) => shiftDate(d, -1))}
              disabled={!!hold}
            >
              <ChevronLeft width={16} height={16} /> Prev
            </button>
            <p className="font-tabular text-sm font-semibold text-ink-900">
              {formatClinicDate(new Date(`${date}T12:00:00Z`), { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <button
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-clinical hover:bg-clinical-wash disabled:opacity-40"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              disabled={!!hold}
            >
              Next <ChevronRight width={16} height={16} />
            </button>
          </div>

          {loadingSlots ? (
            <Skeleton className="h-[420px] w-full rounded-lg" />
          ) : !workingHoursForDate && emptyReason === "NO_WORKING_HOURS" ? (
            <EmptyState title="Not in clinic this day" subtitle="Try another day with the arrows above." illustration={<EmptyRail />} />
          ) : workingHoursForDate ? (
            <DayRail
              workStartMinute={workingHoursForDate.startMinute}
              workEndMinute={workingHoursForDate.endMinute}
              slotDurationMins={doctor?.slotDurationMins ?? 30}
              availableSlots={slots}
              onLeave={emptyReason === "ON_LEAVE"}
              heldSlot={hold ? { startsAt: hold.startsAt, holdExpiresAt: hold.holdExpiresAt } : null}
              pendingSlot={pendingSlot}
              conflictSlot={conflictSlot}
              now={new Date()}
              secondsLeft={secondsLeft}
              isToday={date === todayDateString()}
              timeZone={CLINIC_TIME_ZONE}
              onSlotClick={handleSlotClick}
            />
          ) : (
            <EmptyState title="Fully booked" subtitle="Try another day with the arrows above." illustration={<EmptyRail />} />
          )}

          {/* Alternatives slide in beneath the rail on a 409 (§5.3) */}
          <AnimatePresence>
            {alternatives && alternatives.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <Eyebrow className="mb-2">Three other times</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {alternatives.map((s, i) => (
                    <motion.button
                      key={s.startsAt}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => {
                        setAlternatives(null);
                        handleSlotClick(s.startsAt);
                      }}
                      className="rounded-md border border-clinical-line bg-surface-overlay px-3 py-1.5 font-tabular text-sm text-clinical shadow-elev-1 hover:bg-clinical hover:text-white"
                    >
                      {formatClinicDateTime(s.startsAt, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Hold + symptom panel */}
        <Card className="lg:sticky lg:top-6">
          {hold ? (
            <div>
              <div className="mb-4">
                <CountdownRing secondsLeft={secondsLeft ?? 0} />
              </div>
              <Label htmlFor="symptoms">What brings you in?</Label>
              <Textarea
                id="symptoms"
                rows={5}
                placeholder="Describe your symptoms — optional, but it helps your doctor prepare."
                value={symptomText}
                onChange={(e) => setSymptomText(e.target.value)}
              />
              <p className="mt-2 mb-4 text-xs text-ink-500">Shared with your doctor only — never used to diagnose you.</p>
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
                  Release
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-clinical-wash text-clinical">
                <Clock width={22} height={22} />
              </div>
              <p className="font-display font-semibold text-ink-900">Pick a time</p>
              <p className="mt-1 text-sm text-ink-500">
                Tap an open slot on the rail to hold it for five minutes while you add your symptoms.
              </p>
            </div>
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

/** Empty-state illustration: a blank day rail drawn from the app's own vocabulary (§4). */
function EmptyRail() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="95" height="71" rx="8" stroke="var(--ink-line-strong)" />
      <line x1="24" y1="0" x2="24" y2="72" stroke="var(--ink-line)" />
      {[18, 36, 54].map((y) => (
        <line key={y} x1="24" y1={y} x2="96" y2={y} stroke="var(--ink-line)" strokeDasharray="3 3" />
      ))}
      {[6, 24, 42, 60].map((y) => (
        <text key={y} x="16" y={y + 8} textAnchor="end" fontSize="6" fill="var(--ink-400)" fontFamily="monospace">
          {9 + y / 18}:00
        </text>
      ))}
      <rect x="30" y="22" width="60" height="12" rx="3" fill="var(--clinical-wash)" stroke="var(--clinical-line)" />
    </svg>
  );
}
