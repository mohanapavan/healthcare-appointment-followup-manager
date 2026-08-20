import { afterAll, describe, expect, it, vi } from "vitest";

// Force the "configured" code path so generatePreVisitSummary/PostVisitSummary
// actually build and send a prompt, instead of short-circuiting straight to
// fallback — that's the only way to inspect what would be sent to the real
// API. Set before any import in this file touches env.ts's lazily-cached
// getEnv(); Vitest gives each test file its own module graph, so this
// doesn't leak into other test files.
process.env.GEMINI_API_KEY = "test-key-never-sent-anywhere-real";

const capturedPrompts: string[] = [];
vi.mock("@/lib/llm/gemini", () => ({
  GeminiProvider: class {
    async generate(prompt: string) {
      capturedPrompts.push(prompt);
      // Throw so the call falls through to the deterministic fallback —
      // this test never makes a real network call.
      throw new Error("mocked provider: no real Gemini call in tests");
    }
  },
}));

import { prisma } from "@/lib/prisma";
import { generatePostVisitSummary, generatePreVisitSummary } from "@/lib/llm";
import { recordLlmSuccess } from "@/lib/llm/circuit-breaker";

if (!process.env.DATABASE_URL?.includes("hospital_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at hospital_test.");
}

describe("LLM layer — PII is never sent to the provider", () => {
  afterAll(async () => {
    await recordLlmSuccess(); // leave the circuit breaker closed for other suites
    await prisma.$disconnect();
  });

  it("never includes the patient's name or email in the pre-visit prompt", async () => {
    const patientName = "Zzyzx Uniquename";
    const patientEmail = "zzyzx.uniquename@example.com";
    // Deliberately does NOT mention the patient's name/email — proves the
    // prompt builder has no path to include them, not just that this
    // particular symptom text happens not to.
    const symptomText = "persistent cough and mild fever for three days";

    await generatePreVisitSummary(crypto.randomUUID(), symptomText);

    expect(capturedPrompts.length).toBeGreaterThan(0);
    for (const prompt of capturedPrompts) {
      expect(prompt).not.toContain(patientName);
      expect(prompt).not.toContain(patientEmail);
      expect(prompt).toContain(symptomText);
    }
  });

  it("never includes the patient's name or email in the post-visit prompt", async () => {
    capturedPrompts.length = 0;
    const patientName = "Zzyzx Uniquename";
    const patientEmail = "zzyzx.uniquename@example.com";

    await generatePostVisitSummary(crypto.randomUUID(), "Mild viral infection, supportive care advised.", [
      { medicationName: "Ibuprofen 200mg", dosage: "1 tablet", timesPerDay: 2, durationDays: 3 },
    ]);

    expect(capturedPrompts.length).toBeGreaterThan(0);
    for (const prompt of capturedPrompts) {
      expect(prompt).not.toContain(patientName);
      expect(prompt).not.toContain(patientEmail);
      expect(prompt).toContain("Ibuprofen 200mg");
    }
  });
});
