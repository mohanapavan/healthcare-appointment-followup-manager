export interface CalendarEventDetails {
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  attendeeEmails: string[];
}

/** Thrown when Google reports the stored refresh token is no longer valid (revoked/expired consent). Callers mark the link broken and prompt reconnect — never fail the booking itself. */
export class InvalidGrantError extends Error {}

export interface CalendarProvider {
  createEvent(refreshToken: string, details: CalendarEventDetails): Promise<{ externalEventId: string }>;
  updateEvent(refreshToken: string, externalEventId: string, details: CalendarEventDetails): Promise<void>;
  deleteEvent(refreshToken: string, externalEventId: string): Promise<void>;
}
