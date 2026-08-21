import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

/**
 * Public patient self-registration. New in the UI upgrade so the "front door"
 * (§6.2 /register) actually works — creates a PATIENT only. Doctor and admin
 * accounts are still provisioned by an admin, never self-served. This is a new
 * route; it does not touch any existing service, schema, or migration.
 */
const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().max(40).optional(),
});

export const POST = withApi(async (req: NextRequest) => {
  const input = await parseBody(req, schema);
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("VALIDATION_ERROR", "An account with that email already exists. Try signing in.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      passwordHash: await hashPassword(input.password),
      role: "PATIENT",
    },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ user }, { status: 201 });
});
