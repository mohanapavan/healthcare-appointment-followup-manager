import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { AppError } from "./errors";
import { prisma } from "./prisma";

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
}

/**
 * Server-side session check. Every API route that needs a signed-in user
 * calls this itself — UI role gating is cosmetic and is not trusted here
 * (CLAUDE.md §hard-rules #5).
 */
export async function requireAuth(): Promise<AuthUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("UNAUTHENTICATED", "Sign in required");
  }
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
  };
}

/** Same as requireAuth, but also asserts the caller's role is in `roles`. */
export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "You do not have access to this resource");
  }
  return user;
}

/** Admin manages every doctor's schedule; a doctor manages only their own. */
export async function requireAdminOrOwningDoctor(doctorProfileId: string): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role === "ADMIN") return user;
  if (user.role === "DOCTOR") {
    const profile = await prisma.doctorProfile.findUnique({ where: { id: doctorProfileId } });
    if (profile?.userId === user.id) return user;
  }
  throw new AppError("FORBIDDEN", "You do not have access to this doctor's schedule");
}
