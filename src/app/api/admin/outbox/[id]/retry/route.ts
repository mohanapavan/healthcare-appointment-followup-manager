import { NextRequest, NextResponse } from "next/server";
import { withApiParams } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/** Manual retry from the admin dead-letter view — a human override, so it gets a fresh attempt budget rather than picking up where the automatic backoff left off. */
export const POST = withApiParams<{ id: string }>(async (_req: NextRequest, { params }) => {
  await requireRole("ADMIN");

  const event = await prisma.outboxEvent.findUnique({ where: { id: params.id } });
  if (!event) throw new AppError("NOT_FOUND", "Outbox event not found");
  if (event.status !== "FAILED") {
    throw new AppError("ILLEGAL_STATE_TRANSITION", "Only dead-lettered (FAILED) events can be retried.");
  }

  const updated = await prisma.outboxEvent.update({
    where: { id: params.id },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });

  return NextResponse.json({ event: updated });
});
