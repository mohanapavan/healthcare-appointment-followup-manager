import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withApi(async () => {
  const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now()`;
  return NextResponse.json({ status: "ok", dbTime: now });
});
