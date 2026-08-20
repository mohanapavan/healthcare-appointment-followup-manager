/**
 * Deterministic safety net: these keywords force urgency = High regardless
 * of what the model returns (CLAUDE.md §4 — "must return urgency High for
 * any red-flag symptom", "red-flag symptoms are escalated by deterministic
 * rules, not by the model"). This list runs on every pre-visit submission,
 * whether or not the LLM call itself succeeds.
 */
const RED_FLAG_KEYWORDS = [
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "difficulty breathing",
  "shortness of breath",
  "severe bleeding",
  "uncontrolled bleeding",
  "coughing blood",
  "vomiting blood",
  "blood in stool",
  "blood in urine",
  "suicidal",
  "suicide",
  "self harm",
  "self-harm",
  "unconscious",
  "unresponsive",
  "seizure",
  "stroke",
  "slurred speech",
  "facial drooping",
  "numbness on one side",
  "severe allergic reaction",
  "anaphylaxis",
  "throat closing",
  "swelling of face",
  "swelling of throat",
  "overdose",
  "poisoning",
  "severe head injury",
  "loss of consciousness",
  "high fever in infant",
  "blue lips",
  "blue skin",
];

export function containsRedFlag(text: string): boolean {
  const lower = text.toLowerCase();
  return RED_FLAG_KEYWORDS.some((kw) => lower.includes(kw));
}
