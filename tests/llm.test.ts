import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generatePreVisitSummary, generatePostVisitSummary } from "@/lib/llm";
import { containsRedFlag } from "@/lib/llm/red-flags";
import { isCircuitOpen, recordLlmFailure, recordLlmSuccess } from "@/lib/llm/circuit-breaker";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}
// This file relies on GEMINI_API_KEY being unset (the .env.test default) so
// every generation call exercises the deterministic fallback without a
// network call — the fallback path is what most of these tests verify.
if (process.env.GEMINI_API_KEY) {
  throw new Error("This test file assumes GEMINI_API_KEY is unset; found a value.");
}

describe("LLM layer — deterministic fallback (no API key configured)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("falls back for pre-visit and marks the audit row as FALLBACK", async () => {
    const bookingId = crypto.randomUUID(); // no real FK needed — AiGeneration.entityId is unenforced by design
    const output = await generatePreVisitSummary(bookingId, "mild headache since yesterday afternoon");

    expect(output.urgency).toBe("Medium");
    expect(output.chiefComplaint).toContain("mild headache");
    expect(output.questions).toHaveLength(3);

    const row = await prisma.aiGeneration.findFirstOrThrow({
      where: { entityType: "BOOKING_PRE_VISIT", entityId: bookingId },
    });
    expect(row.source).toBe("FALLBACK");
    expect(row.model).toBeTruthy();
    expect(row.promptVersion).toBe("pre-visit-v1");
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    expect(row.urgency).toBe("MEDIUM");
  });

  it("escalates to High on a red-flag symptom even though the fallback ran, not the model", async () => {
    const bookingId = crypto.randomUUID();
    const output = await generatePreVisitSummary(bookingId, "sudden chest pain and shortness of breath");
    expect(output.urgency).toBe("High");

    const row = await prisma.aiGeneration.findFirstOrThrow({
      where: { entityType: "BOOKING_PRE_VISIT", entityId: bookingId },
    });
    expect(row.urgency).toBe("HIGH");
  });

  it("passes empty symptom text through gracefully (the documented edge case)", async () => {
    const output = await generatePreVisitSummary(crypto.randomUUID(), "");
    expect(output.chiefComplaint).toBe("No symptom details were provided by the patient.");
    expect(output.urgency).toBe("Medium");
  });

  it("falls back for post-visit, building the medication schedule from structured DB fields only", async () => {
    const prescriptionId = crypto.randomUUID();
    const output = await generatePostVisitSummary(prescriptionId, "Viral pharyngitis, supportive care.", [
      { medicationName: "Paracetamol 500mg", dosage: "1 tablet", timesPerDay: 3, durationDays: 5 },
    ]);

    expect(output.summary).toContain("Viral pharyngitis");
    expect(output.medicationSchedule).toEqual([
      { medication: "Paracetamol 500mg", dosage: "1 tablet", schedule: "3 times a day for 5 days" },
    ]);
    expect(output.followUpSteps.length).toBeGreaterThan(0);

    const row = await prisma.aiGeneration.findFirstOrThrow({
      where: { entityType: "PRESCRIPTION_POST_VISIT", entityId: prescriptionId },
    });
    expect(row.source).toBe("FALLBACK");
    expect(row.promptVersion).toBe("post-visit-v1");
  });
});

describe("red-flag keyword rules", () => {
  it("flags known emergency phrases", () => {
    expect(containsRedFlag("I have severe chest pain")).toBe(true);
    expect(containsRedFlag("I think I might be having a stroke")).toBe(true);
    expect(containsRedFlag("feeling suicidal lately")).toBe(true);
  });

  it("does not flag ordinary symptom text", () => {
    expect(containsRedFlag("runny nose and mild cough for two days")).toBe(false);
    expect(containsRedFlag("")).toBe(false);
  });
});

describe("circuit breaker (DB-backed, survives serverless cold starts)", () => {
  beforeEach(async () => {
    await recordLlmSuccess(); // reset to closed before each test
  });
  afterEach(async () => {
    await recordLlmSuccess(); // leave it closed for any other suite
  });

  it("opens after 3 consecutive failures and closes on success", async () => {
    expect(await isCircuitOpen()).toBe(false);

    await recordLlmFailure();
    expect(await isCircuitOpen()).toBe(false);
    await recordLlmFailure();
    expect(await isCircuitOpen()).toBe(false);
    await recordLlmFailure();
    expect(await isCircuitOpen()).toBe(true);

    await recordLlmSuccess();
    expect(await isCircuitOpen()).toBe(false);
  });
});
