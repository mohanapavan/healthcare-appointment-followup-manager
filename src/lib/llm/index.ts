import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isLlmConfigured, getEnv } from "@/lib/env";
import { isCircuitOpen, recordLlmFailure, recordLlmSuccess } from "./circuit-breaker";
import { postVisitFallback, preVisitFallback } from "./fallback";
import { GeminiProvider } from "./gemini";
import {
  buildPostVisitPrompt,
  buildPostVisitRetryPrompt,
  buildPreVisitPrompt,
  buildPreVisitRetryPrompt,
  POST_VISIT_PROMPT_VERSION,
  PRE_VISIT_PROMPT_VERSION,
} from "./prompts";
import { PostVisitOutputSchema, PreVisitOutputSchema, type PostVisitOutput, type PreVisitOutput } from "./schemas";
import { containsRedFlag } from "./red-flags";
import type { LlmProvider } from "./types";

const provider: LlmProvider = new GeminiProvider();

// PreVisitOutputSchema uses "Low"/"Medium"/"High" (the brief's exact wording
// for the prompt contract); Prisma's AiUrgency enum is upper-case.
const URGENCY_TO_DB = { Low: "LOW", Medium: "MEDIUM", High: "HIGH" } as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips markdown code fences models sometimes wrap JSON in. */
function tryParseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

interface GenerationRecord<T> {
  output: T;
  source: "LLM" | "FALLBACK";
  rawResponse: string | null;
  latencyMs: number;
  tokenCount?: number;
  model: string;
}

async function runGeneration<T>(opts: {
  buildPrompt: () => string;
  buildRetryPrompt: (validationError: string) => string;
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { message: string } } };
  fallback: () => T;
}): Promise<GenerationRecord<T>> {
  const start = Date.now();
  const env = getEnv();

  if (!isLlmConfigured() || (await isCircuitOpen())) {
    return { output: opts.fallback(), source: "FALLBACK", rawResponse: null, latencyMs: Date.now() - start, model: env.LLM_MODEL };
  }

  let raw: string | undefined;
  let tokenCount: number | undefined;
  try {
    const result = await provider.generate(opts.buildPrompt());
    raw = result.text;
    tokenCount = result.tokenCount;
  } catch {
    // Timeout/network/etc: single retry with a short backoff, then fallback.
    await sleep(500 + Math.random() * 300);
    try {
      const result = await provider.generate(opts.buildPrompt());
      raw = result.text;
      tokenCount = result.tokenCount;
    } catch (err2) {
      await recordLlmFailure();
      logger.warn("llm call failed after retry, using fallback", {
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return {
        output: opts.fallback(),
        source: "FALLBACK",
        rawResponse: null,
        latencyMs: Date.now() - start,
        model: env.LLM_MODEL,
      };
    }
  }

  let parsed = tryParseJson(raw);
  let validation = opts.schema.safeParse(parsed);

  if (!validation.success) {
    // A response that fails validation is a failure, not a result: retry
    // once with the validation error appended, then fall back.
    try {
      const retry = await provider.generate(opts.buildRetryPrompt(validation.error?.message ?? "invalid JSON"));
      raw = retry.text;
      tokenCount = retry.tokenCount ?? tokenCount;
      parsed = tryParseJson(raw);
      validation = opts.schema.safeParse(parsed);
    } catch {
      // fall through — still invalid, handled below
    }
  }

  if (!validation.success || validation.data === undefined) {
    await recordLlmFailure();
    logger.warn("llm response failed schema validation twice, using fallback", { rawResponse: raw });
    return {
      output: opts.fallback(),
      source: "FALLBACK",
      rawResponse: raw ?? null,
      latencyMs: Date.now() - start,
      model: env.LLM_MODEL,
      tokenCount,
    };
  }

  await recordLlmSuccess();
  return {
    output: validation.data,
    source: "LLM",
    rawResponse: raw ?? null,
    latencyMs: Date.now() - start,
    tokenCount,
    model: env.LLM_MODEL,
  };
}

/**
 * Symptoms only — never pass patient name/email/phone/DOB into an LLM call
 * (CLAUDE.md §4 compliance instinct). entityId is the booking id; the audit
 * row is what makes this generation traceable end to end via correlationId.
 */
export async function generatePreVisitSummary(
  bookingId: string,
  symptomText: string,
  correlationId?: string
): Promise<PreVisitOutput> {
  const record = await runGeneration<PreVisitOutput>({
    buildPrompt: () => buildPreVisitPrompt(symptomText),
    buildRetryPrompt: (err) => buildPreVisitRetryPrompt(symptomText, err),
    schema: PreVisitOutputSchema,
    fallback: () => preVisitFallback(symptomText),
  });

  // Red-flag escalation is deterministic and applies regardless of source —
  // the model does not get the final say on urgency for a red-flag symptom.
  const urgency = containsRedFlag(symptomText) ? "High" : record.output.urgency;
  const output: PreVisitOutput = { ...record.output, urgency };

  await prisma.aiGeneration.create({
    data: {
      entityType: "BOOKING_PRE_VISIT",
      entityId: bookingId,
      correlationId,
      promptVersion: PRE_VISIT_PROMPT_VERSION,
      model: record.model,
      source: record.source,
      rawResponse: record.rawResponse,
      parsedOutput: output,
      urgency: URGENCY_TO_DB[output.urgency],
      latencyMs: record.latencyMs,
      tokenCount: record.tokenCount,
    },
  });

  return output;
}

/** Clinical notes + structured medication list only — same PII rule as pre-visit. */
export async function generatePostVisitSummary(
  prescriptionId: string,
  clinicalNotes: string,
  medications: { medicationName: string; dosage: string; timesPerDay: number; durationDays: number }[],
  correlationId?: string
): Promise<PostVisitOutput> {
  const record = await runGeneration<PostVisitOutput>({
    buildPrompt: () => buildPostVisitPrompt(clinicalNotes, medications),
    buildRetryPrompt: (err) => buildPostVisitRetryPrompt(clinicalNotes, medications, err),
    schema: PostVisitOutputSchema,
    fallback: () => postVisitFallback(clinicalNotes, medications),
  });

  await prisma.aiGeneration.create({
    data: {
      entityType: "PRESCRIPTION_POST_VISIT",
      entityId: prescriptionId,
      correlationId,
      promptVersion: POST_VISIT_PROMPT_VERSION,
      model: record.model,
      source: record.source,
      rawResponse: record.rawResponse,
      parsedOutput: record.output,
      latencyMs: record.latencyMs,
      tokenCount: record.tokenCount,
    },
  });

  return record.output;
}
