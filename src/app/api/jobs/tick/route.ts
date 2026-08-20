import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { reapExpiredHolds } from "@/services/jobs";
import { drainOutbox, scheduleUpcomingReminders } from "@/services/outbox";

/**
 * Drained by the host's cron every minute (Vercel Cron / Render Cron — free
 * hosting has no long-lived worker process, see README for the tradeoff).
 * Reaps expired slot holds, schedules due appointment reminders, and drains
 * the outbox (email dispatch; calendar and AI-generation dispatch land in
 * later phases).
 */
export const POST = withApi(async (req: NextRequest) => {
  const env = getEnv();
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing cron secret.");
  }

  const expiredHolds = await reapExpiredHolds();
  const remindersScheduled = await scheduleUpcomingReminders();
  const outbox = await drainOutbox();

  return NextResponse.json({ expiredHolds, remindersScheduled, outbox });
});
