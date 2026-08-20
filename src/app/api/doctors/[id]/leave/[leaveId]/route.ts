import { NextResponse } from "next/server";
import { withApiParams } from "@/lib/api";
import { requireAdminOrOwningDoctor } from "@/lib/authz";
import { deleteLeave } from "@/services/leave";

export const DELETE = withApiParams<{ id: string; leaveId: string }>(async (_req, { params }) => {
  await requireAdminOrOwningDoctor(params.id);
  await deleteLeave(params.leaveId, params.id);
  return NextResponse.json({ ok: true });
});
