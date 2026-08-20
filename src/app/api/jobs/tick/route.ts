import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { reapExpiredHolds } from "@/services/jobs";

/**
 * Drained by the host's cron every minute (Vercel Cron / Render Cron — free
 * hosting has no long-lived worker process, see README for the tradeoff).
 * Reaps expired slot holds now; drains the outbox (email/calendar/AI
 * dispatch) once Phase 3 lands.
 */
export const POST = withApi(async (req: NextRequest) => {
  const env = getEnv();
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing cron secret.");
  }

  const expiredHolds = await reapExpiredHolds();

  return NextResponse.json({ expiredHolds });
});
