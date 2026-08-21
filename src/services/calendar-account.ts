import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";

export async function connectGoogleAccount(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiryDate: Date; scope: string }
) {
  return prisma.googleCalendarAccount.upsert({
    where: { userId },
    update: {
      encryptedAccessToken: encryptSecret(tokens.accessToken),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken),
      expiryDate: tokens.expiryDate,
      scope: tokens.scope,
      status: "ACTIVE",
    },
    create: {
      userId,
      encryptedAccessToken: encryptSecret(tokens.accessToken),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken),
      expiryDate: tokens.expiryDate,
      scope: tokens.scope,
      status: "ACTIVE",
    },
  });
}

export async function disconnectGoogleAccount(userId: string): Promise<void> {
  await prisma.googleCalendarAccount.deleteMany({ where: { userId } });
}

/** Null if not connected, or connected but marked BROKEN (caller should treat both as "skip calendar sync for this user"). */
export async function getActiveRefreshToken(userId: string): Promise<string | null> {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { userId } });
  if (!account || account.status !== "ACTIVE") return null;
  return decryptSecret(account.encryptedRefreshToken);
}

/** Revoked/expired consent (the spec §7): mark broken, keep the appointment valid, prompt the user to reconnect next time they view the calendar settings (Phase 8 UI). */
export async function markAccountBroken(userId: string): Promise<void> {
  const result = await prisma.googleCalendarAccount.updateMany({
    where: { userId },
    data: { status: "BROKEN" },
  });
  if (result.count > 0) {
    logger.warn("google calendar account marked broken (invalid_grant)", { userId });
  }
}
