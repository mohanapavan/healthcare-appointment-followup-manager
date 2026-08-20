import { prisma } from "@/lib/prisma";

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 60_000;
const SINGLETON_ID = 1;

async function getOrCreateState() {
  return prisma.aiCircuitBreaker.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

/** After 3 consecutive provider failures, skip calling the LLM for 60s and go straight to fallback (CLAUDE.md §4). */
export async function isCircuitOpen(): Promise<boolean> {
  const state = await getOrCreateState();
  return Boolean(state.openUntil && state.openUntil > new Date());
}

export async function recordLlmSuccess(): Promise<void> {
  await prisma.aiCircuitBreaker.upsert({
    where: { id: SINGLETON_ID },
    update: { consecutiveFailures: 0, openUntil: null },
    create: { id: SINGLETON_ID, consecutiveFailures: 0, openUntil: null },
  });
}

export async function recordLlmFailure(): Promise<void> {
  const state = await getOrCreateState();
  const consecutiveFailures = state.consecutiveFailures + 1;
  const openUntil =
    consecutiveFailures >= FAILURE_THRESHOLD ? new Date(Date.now() + OPEN_DURATION_MS) : state.openUntil;
  await prisma.aiCircuitBreaker.update({
    where: { id: SINGLETON_ID },
    data: { consecutiveFailures, openUntil },
  });
}
