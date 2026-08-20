import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getEnv } from "./env";

export function clinicTimeZone(): string {
  return getEnv().APP_TIMEZONE;
}

/**
 * Converts a calendar date ("2026-09-01") plus minutes-since-midnight (as
 * stored on WorkingHours, interpreted in the clinic's timezone) into the
 * correct UTC instant — accounting for DST, which a naive fixed-offset
 * calculation would get wrong twice a year.
 */
export function slotStartUtc(dateStr: string, minuteOfDay: number): Date {
  const hh = Math.floor(minuteOfDay / 60)
    .toString()
    .padStart(2, "0");
  const mm = (minuteOfDay % 60).toString().padStart(2, "0");
  const wallClock = `${dateStr}T${hh}:${mm}:00`;
  return fromZonedTime(wallClock, clinicTimeZone());
}

/**
 * Day-of-week (0 = Sunday .. 6 = Saturday) for a calendar date string. This
 * is timezone-independent by construction — "2026-09-01" is a Tuesday no
 * matter what timezone you ask in — so we anchor at UTC noon purely to stay
 * clear of any date-boundary edge case in the parse itself.
 */
export function dayOfWeekOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The calendar date (YYYY-MM-DD) a UTC instant falls on *as observed in the
 * clinic's timezone* — not the UTC date, which can differ near midnight.
 * Used to look up which day's working hours / leave a given `startsAt`
 * belongs to.
 *
 * NB: date-fns-tz's `toZonedTime` deliberately returns a Date meant to be
 * read back with *local* (system-timezone) getters, not UTC getters — its
 * own docs: "regardless of the current system time zone" the local getters
 * show the target zone's wall clock. Reading it with getUTC* instead silently
 * applies the wrong offset on any machine not already running in UTC.
 */
export function localDateOf(date: Date): string {
  const zoned = toZonedTime(date, clinicTimeZone());
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** minute-of-day (0-1439) a UTC instant falls on in the clinic's timezone. */
export function localMinuteOfDay(date: Date): number {
  const zoned = toZonedTime(date, clinicTimeZone());
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** Adds `days` to a calendar date string, staying in plain calendar-date arithmetic (no timezone involved). */
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}
