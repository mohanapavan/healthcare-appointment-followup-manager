import { GoogleCalendarProvider } from "./google";
import type { CalendarProvider } from "./types";

export type { CalendarEventDetails, CalendarProvider } from "./types";
export { InvalidGrantError } from "./types";

let cached: CalendarProvider | null = null;

export function getCalendarProvider(): CalendarProvider {
  if (!cached) cached = new GoogleCalendarProvider();
  return cached;
}
