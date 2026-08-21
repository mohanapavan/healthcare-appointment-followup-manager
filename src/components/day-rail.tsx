"use client";

import { toZonedTime } from "date-fns-tz";
import { motion, AnimatePresence, useReducedMotion, SPRING } from "./motion";
import { Lock } from "./icons";

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
  isToday = false,
  conflictSlot = null,
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
  /** Clinic's IANA timezone (APP_TIMEZONE) — working-hours minutes are clinic-local. */
  timeZone: string;
  isToday?: boolean;
  /** ISO of a slot that just 409'd — it shakes and settles back (§5.3). */
  conflictSlot?: string | null;
  onSlotClick: (startsAtIso: string) => void;
}) {
  const reduce = useReducedMotion();
  const HOUR_PX = 64;
  const totalMinutes = workEndMinute - workStartMinute;
  const railHeight = (totalMinutes / 60) * HOUR_PX;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(workStartMinute / 60) * 60; m <= workEndMinute; m += 60) hourMarks.push(m);

  const localMinuteOf = (iso: string) => {
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

  // "Now" line — only when the displayed day is today and now is in the window.
  const nowZoned = toZonedTime(now, timeZone);
  const nowMinute = nowZoned.getHours() * 60 + nowZoned.getMinutes();
  const showNow = isToday && nowMinute >= workStartMinute && nowMinute <= workEndMinute;

  if (onLeave) {
    return (
      <div
        className="relative flex items-center justify-center rounded-lg border border-ink-line bg-surface-raised shadow-elev-1"
        style={{ height: Math.max(railHeight, 220) }}
      >
        <div
          className="absolute inset-0 rounded-lg opacity-60"
          style={{
            background:
              "repeating-linear-gradient(135deg, var(--caution-wash) 0px, var(--caution-wash) 10px, transparent 10px, transparent 20px)",
          }}
          aria-hidden="true"
        />
        <p className="relative rounded-md border border-caution-line bg-surface-overlay px-4 py-2 font-display font-medium text-ink-900 shadow-elev-1">
          Doctor on leave this day
        </p>
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-ink-line bg-surface-raised shadow-elev-1">
      {/* Hour gutter */}
      <div className="relative w-14 shrink-0 border-r border-ink-line bg-surface-base font-tabular text-[11px] text-ink-500" style={{ height: railHeight }}>
        {hourMarks.map((m) => (
          <div
            key={m}
            className="absolute right-2 whitespace-nowrap pt-0.5"
            style={{ top: ((m - workStartMinute) / 60) * HOUR_PX }}
          >
            {formatHour(m)}
          </div>
        ))}
      </div>

      {/* Rail body */}
      <div className="relative flex-1" style={{ height: railHeight }}>
        {hourMarks.map((m) => (
          <div key={m} className="absolute inset-x-0 border-t border-ink-line" style={{ top: ((m - workStartMinute) / 60) * HOUR_PX }} />
        ))}

        {cells.map((cell) => {
            const top = ((cell.minute - workStartMinute) / 60) * HOUR_PX;
            const height = Math.max((slotDurationMins / 60) * HOUR_PX - 4, 22);
            const iso = availableByMinute.get(cell.minute)?.startsAt ?? heldSlot?.startsAt;

            if (cell.state === "held" && heldSlot) {
              const ratio = secondsLeft !== null ? Math.max(0, secondsLeft / 300) : 0;
              const tone = secondsLeft !== null && secondsLeft <= 20 ? "urgent" : secondsLeft !== null && secondsLeft <= 60 ? "caution" : "caution";
              return (
                <motion.div
                  key={cell.minute}
                  initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={SPRING}
                  className="absolute left-1.5 right-1.5 overflow-hidden rounded-md border-2 border-caution bg-caution-wash shadow-elev-2"
                  style={{ top: top - 1, height: height + 2 }}
                >
                  <div className="flex h-full items-center justify-between px-2.5">
                    <span className="font-tabular text-xs font-semibold text-caution-ink">
                      {formatMinute(cell.minute)} · holding
                    </span>
                    <span className="font-tabular text-xs font-bold tabular-nums text-caution-ink" aria-live="polite">
                      {secondsLeft !== null ? fmtClock(secondsLeft) : ""}
                    </span>
                  </div>
                  {/* depleting hold bar (a designed countdown, not animate-pulse) */}
                  <div
                    className={`absolute inset-x-0 bottom-0 h-1 origin-left motion-reduce:hidden ${tone === "urgent" ? "bg-urgent" : "bg-caution"}`}
                    style={{ transform: `scaleX(${ratio})`, transition: "transform 1s linear" }}
                  />
                </motion.div>
              );
            }

            const isPending = pendingSlot === iso;
            const isConflict = conflictSlot !== null && conflictSlot === iso;
            const clickable = cell.state === "available" && !heldSlot;

            return (
              <motion.button
                key={cell.minute}
                type="button"
                disabled={!clickable}
                onClick={() => iso && onSlotClick(iso)}
                animate={
                  reduce
                    ? undefined
                    : isConflict
                      ? { x: [0, -6, 6, -4, 0], scale: 1 }
                      : isPending
                        ? { scale: 1.02 }
                        : { scale: 1, x: 0 }
                }
                transition={isConflict ? { duration: 0.32 } : SPRING}
                aria-label={
                  cell.state === "occupied"
                    ? `${formatMinute(cell.minute)}, booked`
                    : cell.state === "past"
                      ? `${formatMinute(cell.minute)}, no longer available`
                      : `Hold ${formatMinute(cell.minute)}`
                }
                className={`absolute left-1.5 right-1.5 flex items-center gap-1.5 rounded-md px-2.5 text-left font-tabular text-xs ${cellStyle(cell.state, isPending)}`}
                style={{ top, height }}
              >
                {cell.state === "occupied" && <Lock width={12} height={12} className="shrink-0 opacity-70" />}
                <span className={height > 26 ? "block" : "sr-only"}>
                  {formatMinute(cell.minute)}
                  {cell.state === "occupied" && " · Booked"}
                  {isPending && " · Holding…"}
                </span>
              </motion.button>
            );
          })}

        {/* Now line */}
        <AnimatePresence>
          {showNow && (
            <motion.div
              className="pointer-events-none absolute inset-x-0 z-10"
              style={{ top: ((nowMinute - workStartMinute) / 60) * HOUR_PX }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="relative h-px bg-clinical">
                <span className="absolute -left-[3.35rem] -top-2.5 rounded-sm bg-clinical px-1.5 py-0.5 font-tabular text-[10px] font-semibold text-white shadow-elev-1">
                  {formatMinute(nowMinute)}
                </span>
                <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-clinical" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Prominent circular countdown for the hold panel (§5.2, §6.3). The ring
    depletes, numerals tick in Plex Mono, and label + colour cross
    caution→urgent together (colour never carries meaning alone). */
export function CountdownRing({ secondsLeft, total = 300 }: { secondsLeft: number; total?: number }) {
  const ratio = Math.max(0, Math.min(1, secondsLeft / total));
  const stage = secondsLeft <= 20 ? "urgent" : secondsLeft <= 60 ? "caution" : "ok";
  const color = stage === "urgent" ? "var(--urgent)" : stage === "caution" ? "var(--caution)" : "var(--clinical)";
  const label = stage === "urgent" ? "Expiring — confirm now" : stage === "caution" ? "Expiring soon" : "Holding your slot";
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--ink-line)" strokeWidth="6" />
          <circle
            cx="42"
            cy="42"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ratio)}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s ease" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-tabular text-lg font-bold tabular-nums"
          style={{ color }}
          aria-live="polite"
        >
          {fmtClock(secondsLeft)}
        </span>
      </div>
      <div>
        <p className="font-display text-sm font-semibold" style={{ color }}>
          {label}
        </p>
        <p className="mt-0.5 text-xs text-ink-500">Your slot is reserved while the ring runs.</p>
      </div>
    </div>
  );
}

function cellStyle(state: string, isPending: boolean): string {
  if (isPending) return "border-2 border-caution bg-caution-wash text-caution-ink shadow-elev-2 cursor-wait";
  switch (state) {
    case "available":
      return "border border-clinical-line bg-surface-overlay text-clinical shadow-elev-1 hover:bg-clinical hover:text-white hover:shadow-elev-2 cursor-pointer";
    case "occupied":
      return "border border-ink-line bg-surface-base text-ink-400 opacity-60 cursor-not-allowed";
    case "past":
      return "border border-dashed border-ink-line text-ink-400 cursor-not-allowed";
    default:
      return "";
  }
}

function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Compact gutter label: "9 AM", "12 PM". */
function formatHour(minute: number): string {
  const h = Math.floor(minute / 60);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}
