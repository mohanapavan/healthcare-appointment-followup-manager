"use client";

import { toZonedTime } from "date-fns-tz";

interface RailSlot {
  startsAt: string;
  endsAt: string;
}

interface HeldSlot {
  startsAt: string;
  holdExpiresAt: string;
}

export function DayRail({
  workStartMinute,
  workEndMinute,
  slotDurationMins,
  availableSlots,
  onLeave,
  heldSlot,
  pendingSlot,
  now,
  secondsLeft,
  timeZone,
  onSlotClick,
}: {
  workStartMinute: number;
  workEndMinute: number;
  slotDurationMins: number;
  availableSlots: RailSlot[];
  onLeave: boolean;
  heldSlot: HeldSlot | null;
  pendingSlot: string | null;
  now: Date;
  secondsLeft: number | null;
  /** Clinic's IANA timezone (APP_TIMEZONE) — working-hours minutes are clinic-local, not UTC or the browser's own zone. */
  timeZone: string;
  onSlotClick: (startsAtIso: string) => void;
}) {
  const HOUR_PX = 64;
  const totalMinutes = workEndMinute - workStartMinute;
  const railHeight = (totalMinutes / 60) * HOUR_PX;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(workStartMinute / 60) * 60; m <= workEndMinute; m += 60) hourMarks.push(m);

  const localMinuteOf = (iso: string) => {
    // toZonedTime returns a Date meant to be read with *local* (JS-runtime)
    // getters regardless of system timezone — see src/lib/clinic-time.ts
    // for the same convention used server-side.
    const zoned = toZonedTime(new Date(iso), timeZone);
    return zoned.getHours() * 60 + zoned.getMinutes();
  };

  const availableByMinute = new Map(availableSlots.map((s) => [localMinuteOf(s.startsAt), s]));

  const cells: { minute: number; state: "available" | "occupied" | "past" | "held" }[] = [];
  for (let m = workStartMinute; m + slotDurationMins <= workEndMinute; m += slotDurationMins) {
    const iso = availableByMinute.get(m)?.startsAt;
    const isHeld = heldSlot && localMinuteOf(heldSlot.startsAt) === m;
    const isPast = iso ? new Date(iso).getTime() < now.getTime() : false;
    cells.push({
      minute: m,
      state: isHeld ? "held" : iso ? (isPast ? "past" : "available") : "occupied",
    });
  }

  if (onLeave) {
    return (
      <div
        className="relative rounded-lg border border-line bg-[repeating-linear-gradient(135deg,var(--color-line)_0px,var(--color-line)_8px,transparent_8px,transparent_16px)] bg-paper flex items-center justify-center"
        style={{ height: Math.max(railHeight, 200) }}
      >
        <p className="rounded bg-paper-raised border border-line px-4 py-2 font-display font-medium text-ink">
          Doctor on leave this day
        </p>
      </div>
    );
  }

  return (
    <div className="flex" style={{ height: railHeight }}>
      <div className="w-14 shrink-0 relative font-tabular text-xs text-ink-muted">
        {hourMarks.map((m) => (
          <div
            key={m}
            className="absolute -translate-y-1/2"
            style={{ top: ((m - workStartMinute) / 60) * HOUR_PX }}
          >
            {formatMinute(m)}
          </div>
        ))}
      </div>
      <div className="relative flex-1 border-l border-line">
        {hourMarks.map((m) => (
          <div
            key={m}
            className="absolute left-0 right-0 border-t border-line/70"
            style={{ top: ((m - workStartMinute) / 60) * HOUR_PX }}
          />
        ))}

        {cells.map((cell) => {
          const top = ((cell.minute - workStartMinute) / 60) * HOUR_PX;
          const height = (slotDurationMins / 60) * HOUR_PX;
          const iso = availableByMinute.get(cell.minute)?.startsAt ?? heldSlot?.startsAt;

          if (cell.state === "held" && heldSlot) {
            return (
              <div
                key={cell.minute}
                className="absolute left-1 right-1 rounded-md border-2 border-caution bg-caution-bg px-2 py-1 overflow-hidden"
                style={{ top, height: Math.max(height - 4, 24) }}
              >
                <div className="flex items-center justify-between h-full">
                  <span className="font-tabular text-xs font-semibold text-caution">
                    {formatMinute(cell.minute)} — holding
                  </span>
                  <span className="font-tabular text-xs font-semibold text-caution" aria-live="polite">
                    {secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : ""}
                  </span>
                </div>
                <div className="absolute bottom-0 left-0 h-1 bg-caution motion-reduce:hidden" style={{ width: `${secondsLeft !== null ? (secondsLeft / (5 * 60)) * 100 : 0}%`, transition: "width 1s linear" }} />
              </div>
            );
          }

          const isPending = pendingSlot === iso;
          const clickable = cell.state === "available" && !heldSlot;

          return (
            <button
              key={cell.minute}
              type="button"
              disabled={!clickable}
              onClick={() => iso && onSlotClick(iso)}
              aria-label={
                cell.state === "occupied"
                  ? `${formatMinute(cell.minute)}, booked`
                  : cell.state === "past"
                    ? `${formatMinute(cell.minute)}, no longer available`
                    : `Hold ${formatMinute(cell.minute)}`
              }
              className={`absolute left-1 right-1 rounded-md px-2 text-left font-tabular text-xs transition-colors ${cellStyle(cell.state, isPending)}`}
              style={{ top, height: Math.max(height - 4, 20) }}
            >
              <span className={height > 28 ? "block pt-1" : "sr-only"}>
                {formatMinute(cell.minute)}
                {cell.state === "occupied" && " · Booked"}
                {isPending && " · Holding…"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cellStyle(state: string, isPending: boolean): string {
  if (isPending) return "bg-caution-bg border-2 border-caution text-caution cursor-wait";
  switch (state) {
    case "available":
      return "bg-white border border-clinical text-clinical hover:bg-clinical hover:text-white cursor-pointer";
    case "occupied":
      return "bg-line/50 border border-line text-ink-muted cursor-not-allowed";
    case "past":
      return "bg-transparent border border-line/50 text-ink-muted/60 cursor-not-allowed";
    default:
      return "bg-transparent";
  }
}

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
