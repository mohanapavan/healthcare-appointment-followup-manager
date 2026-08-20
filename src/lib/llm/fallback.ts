import { containsRedFlag } from "./red-flags";
import type { PostVisitOutput, PreVisitOutput } from "./schemas";

/**
 * The doctor always gets *something* — a rules-based summariser with no
 * external dependency, used whenever the LLM is unconfigured, times out,
 * fails validation twice, or the circuit breaker is open. Symptom/notes
 * text is passed through verbatim rather than paraphrased, since a
 * fallback has no business rewriting clinical language.
 */
export function preVisitFallback(symptomText: string): PreVisitOutput {
  const trimmed = symptomText.trim();
  const urgency = containsRedFlag(trimmed) ? "High" : "Medium";
  const chiefComplaint =
    trimmed.length === 0
      ? "No symptom details were provided by the patient."
      : trimmed.length > 300
        ? `${trimmed.slice(0, 297)}...`
        : trimmed;

  return {
    urgency,
    chiefComplaint,
    questions: [
      "Can you describe when your symptoms started and how they've changed?",
      "Have you taken any medication or tried anything for this already?",
      "Is there anything else you'd like to discuss during this visit?",
    ],
  };
}

export function postVisitFallback(
  clinicalNotes: string,
  medications: { medicationName: string; dosage: string; timesPerDay: number; durationDays: number }[]
): PostVisitOutput {
  return {
    summary: clinicalNotes.trim() || "Your doctor's notes from this visit will be shared with you directly.",
    medicationSchedule: medications.map((m) => ({
      medication: m.medicationName,
      dosage: m.dosage,
      schedule: `${m.timesPerDay} time${m.timesPerDay === 1 ? "" : "s"} a day for ${m.durationDays} day${
        m.durationDays === 1 ? "" : "s"
      }`,
    })),
    followUpSteps: [
      "Take all prescribed medication exactly as directed.",
      "Contact the clinic if your symptoms don't improve or get worse.",
    ],
  };
}
