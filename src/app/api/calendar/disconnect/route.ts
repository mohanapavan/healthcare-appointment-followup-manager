import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { requireAuth } from "@/lib/authz";
import { disconnectGoogleAccount } from "@/services/calendar-account";

export const POST = withApi(async () => {
  const user = await requireAuth();
  await disconnectGoogleAccount(user.id);
  return NextResponse.json({ ok: true });
});
