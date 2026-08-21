import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getEnv, isDemoResetEnabled } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { runSeed, wipeAllData } from "@/services/seed";

/**
 * Deliverable requirement (the spec §9.3): "a demo-reset endpoint so the
 * grader can re-run the flow." Wipes every row this app owns and re-seeds
 * the standard demo data. Deliberately opt-in via DEMO_RESET_SECRET (a
 * separate secret from CRON_SECRET — this is a strictly more destructive
 * capability) rather than always-on, so a deployment that isn't a graded
 * demo doesn't ship a public "wipe the database" button by default.
 */
export const POST = withApi(async (req: NextRequest) => {
  if (!isDemoResetEnabled()) {
    throw new AppError("NOT_FOUND", "Demo reset is not enabled on this deployment.");
  }

  const env = getEnv();
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.DEMO_RESET_SECRET}`) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing demo reset secret.");
  }

  await wipeAllData(prisma);
  const log = await runSeed(prisma);

  return NextResponse.json({ ok: true, log });
});
