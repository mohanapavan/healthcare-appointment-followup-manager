import { google } from "googleapis";
import { getEnv } from "@/lib/env";
import { CalendarEventDetails, CalendarProvider, InvalidGrantError } from "./types";

function oauthClient() {
  const env = getEnv();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

function isInvalidGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
}

function isGone(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 404 || code === 410;
}

export class GoogleCalendarProvider implements CalendarProvider {
  private client(refreshToken: string) {
    const auth = oauthClient();
    auth.setCredentials({ refresh_token: refreshToken });
    return google.calendar({ version: "v3", auth });
  }

  async createEvent(refreshToken: string, details: CalendarEventDetails): Promise<{ externalEventId: string }> {
    try {
      const calendar = this.client(refreshToken);
      const res = await calendar.events.insert({
        calendarId: "primary",
        requestBody: toEventBody(details),
      });
      if (!res.data.id) throw new Error("Google Calendar did not return an event id");
      return { externalEventId: res.data.id };
    } catch (err) {
      if (isInvalidGrant(err)) throw new InvalidGrantError("Google refresh token is no longer valid");
      throw err;
    }
  }

  async updateEvent(refreshToken: string, externalEventId: string, details: CalendarEventDetails): Promise<void> {
    try {
      const calendar = this.client(refreshToken);
      await calendar.events.update({
        calendarId: "primary",
        eventId: externalEventId,
        requestBody: toEventBody(details),
      });
    } catch (err) {
      if (isInvalidGrant(err)) throw new InvalidGrantError("Google refresh token is no longer valid");
      throw err;
    }
  }

  async deleteEvent(refreshToken: string, externalEventId: string): Promise<void> {
    try {
      const calendar = this.client(refreshToken);
      await calendar.events.delete({ calendarId: "primary", eventId: externalEventId });
    } catch (err) {
      if (isInvalidGrant(err)) throw new InvalidGrantError("Google refresh token is no longer valid");
      if (isGone(err)) return; // already gone is a successful delete
      throw err;
    }
  }
}

function toEventBody(details: CalendarEventDetails) {
  return {
    summary: details.summary,
    description: details.description,
    start: { dateTime: details.startsAt.toISOString() },
    end: { dateTime: details.endsAt.toISOString() },
    attendees: details.attendeeEmails.map((email) => ({ email })),
  };
}
