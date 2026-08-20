import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseQuery } from "@/lib/api";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"]).optional(),
});

/** Failures must be visible, not silent (CLAUDE.md §3) — this backs the admin dead-letter view. */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole("ADMIN");
  const { status } = parseQuery(req, querySchema);

  const events = await prisma.outboxEvent.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ events });
});
