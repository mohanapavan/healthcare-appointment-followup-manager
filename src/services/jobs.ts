import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Belt-and-suspenders against the advisory-lock reap in holdSlot(): a hold
 * nobody ever retries against (patient just closes the tab) would otherwise
 * sit HELD, holding the partial-index slot, until someone else happens to
 * request that exact slot. This sweeps all of them on every tick.
 */
export async function reapExpiredHolds(): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: { status: "HELD", holdExpiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) {
    logger.info("reaped expired holds", { count: result.count });
  }
  return result.count;
}
