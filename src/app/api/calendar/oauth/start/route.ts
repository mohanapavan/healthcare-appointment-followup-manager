import { NextResponse } from "next/server";
import { google } from "googleapis";
import { withApi } from "@/lib/api";
import { requireAuth } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { getEnv, isCalendarConfigured } from "@/lib/env";
import { OAUTH_STATE_COOKIE } from "@/lib/calendar/constants";

export const GET = withApi(async () => {
  await requireAuth();
  if (!isCalendarConfigured()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google Calendar isn't configured on this deployment (missing GOOGLE_CLIENT_ID/SECRET)."
    );
  }

  const env = getEnv();
  const client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
  const state = crypto.randomUUID();

  const url = client.generateAuthUrl({
    access_type: "offline",
    // Forces Google to re-issue a refresh token even for a user who
    // consented before — without this, a repeat connect can silently come
    // back with no refresh_token at all.
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
  });
  return res;
});
