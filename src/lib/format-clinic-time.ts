/**
 * Client-safe formatting pinned to the clinic's timezone (NEXT_PUBLIC_APP_TIMEZONE)
 * rather than the viewer's browser timezone. An appointment time is a
 * clinic-scheduled event — like a flight's boarding time, shown in the
 * airport's local time, not the passenger's — so every appointment
 * date/time shown to a user must go through this, not a bare
 * `toLocaleString()` (which silently uses the browser's own timezone and
 * will show the wrong wall-clock time whenever the viewer's system
 * timezone differs from the clinic's — the exact class of bug this file
 * exists to rule out; caught in manual browser testing, not by accident).
 */
export const CLINIC_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "UTC";

// Pin the locale so the SERVER (Node's default locale) and the CLIENT (the
// viewer's browser locale) format identically. With `undefined`, Node rendered
// "Friday 21 August" while an en-US browser rendered "Friday, August 21" — a
// text mismatch that failed hydration and forced React to regenerate the tree.
const LOCALE = "en-US";

export function formatClinicDateTime(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString(LOCALE, { timeZone: CLINIC_TIME_ZONE, ...opts });
}

export function formatClinicDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString(LOCALE, { timeZone: CLINIC_TIME_ZONE, ...opts });
}

export function formatClinicTime(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleTimeString(LOCALE, { timeZone: CLINIC_TIME_ZONE, ...opts });
}
