import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { withApi } from "@/lib/api";
import { requireAuth } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { OAUTH_STATE_COOKIE } from "@/lib/calendar/constants";
import { connectGoogleAccount } from "@/services/calendar-account";

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireAuth();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    throw new AppError("VALIDATION_ERROR", "Invalid or expired OAuth state. Please try connecting again.");
  }

  const env = getEnv();
  const client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token || !tokens.access_token) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google did not return a refresh token. Revoke this app's access in your Google account and try connecting again."
    );
  }

  await connectGoogleAccount(user.id, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600_000),
    scope: tokens.scope ?? "",
  });

  const res = NextResponse.redirect(new URL("/?calendar=connected", env.NEXTAUTH_URL));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
});
