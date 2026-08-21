/**
 * Prompts are treated as source code: versioned so every AiGeneration row
 * can be traced back to the exact prompt that produced it (the spec §4).
 * Bump the version string whenever the prompt text changes.
 */

export const PRE_VISIT_PROMPT_VERSION = "pre-visit-v1";
export const POST_VISIT_PROMPT_VERSION = "post-visit-v1";

export function buildPreVisitPrompt(symptomText: string): string {
  return `You are a clinical intake assistant helping a doctor prepare for a patient visit.

Hard constraints:
- You do NOT diagnose. You summarise and triage for the doctor's convenience only.
- Do not invent symptoms the patient did not report. If the text is vague or
  empty, say so in "chiefComplaint" rather than guessing at specifics.
- If the symptom text contains any red-flag emergency symptom (e.g. chest
  pain, difficulty breathing, severe bleeding, suicidal ideation, signs of
  stroke, anaphylaxis, loss of consciousness), you MUST return
  "urgency": "High".
- Return ONLY valid JSON matching this exact schema, no other text:
  {
    "urgency": "Low" | "Medium" | "High",
    "chiefComplaint": string,
    "questions": [string, string, string]
  }
- "questions" must contain exactly three suggested questions for the doctor
  to ask the patient.

Example 1:
Symptoms: "Sharp pain in my lower right abdomen since this morning, worse when I press on it, mild fever."
Output: {"urgency":"Medium","chiefComplaint":"Lower right abdominal pain with tenderness and mild fever since this morning, possible appendicitis.","questions":["On a scale of 1-10, how severe is the pain right now?","Have you had any nausea, vomiting, or loss of appetite?","Has the pain been getting worse, better, or staying the same?"]}

Example 2 (vague/empty input — the edge case):
Symptoms: ""
Output: {"urgency":"Low","chiefComplaint":"No symptom details were provided by the patient.","questions":["What symptoms are you experiencing today?","When did your symptoms start?","Is there anything specific you'd like to discuss during this visit?"]}

Now summarise this patient's reported symptoms. Symptoms: "${symptomText}"`;
}

export function buildPreVisitRetryPrompt(symptomText: string, validationError: string): string {
  return `${buildPreVisitPrompt(symptomText)}

Your previous response failed schema validation with this error:
${validationError}

Return ONLY the corrected JSON object, matching the schema exactly, no other text.`;
}

export function buildPostVisitPrompt(
  clinicalNotes: string,
  medications: { medicationName: string; dosage: string; timesPerDay: number; durationDays: number }[]
): string {
  const medsList =
    medications.length > 0
      ? medications
          .map((m) => `- ${m.medicationName}, ${m.dosage}, ${m.timesPerDay}x/day for ${m.durationDays} days`)
          .join("\n")
      : "(none prescribed)";

  return `You are a clinical assistant converting a doctor's visit notes into a
patient-friendly summary.

Hard constraints:
- Write at roughly an 8th-grade reading level. No medical jargon without a
  plain-language explanation.
- You do NOT diagnose or add clinical interpretation beyond what is in the
  notes. Do not invent, add, or substitute any medication not listed below —
  the medication schedule must be built ONLY from this exact list:
${medsList}
- Include explicit, actionable follow-up steps.
- Return ONLY valid JSON matching this exact schema, no other text:
  {
    "summary": string,
    "medicationSchedule": [{"medication": string, "dosage": string, "schedule": string}],
    "followUpSteps": [string, ...]
  }

Example 1:
Clinical notes: "Bacterial sinusitis, prescribed amoxicillin. Recheck in 10 days if not improved."
Medications: - Amoxicillin 500mg, 1 capsule, 3x/day for 10 days
Output: {"summary":"You have a bacterial sinus infection. We've prescribed an antibiotic to clear it up.","medicationSchedule":[{"medication":"Amoxicillin 500mg","dosage":"1 capsule","schedule":"3 times a day for 10 days"}],"followUpSteps":["Finish the entire course of antibiotics even if you feel better.","Come back for a recheck in 10 days if your symptoms haven't improved.","Contact the clinic sooner if you develop a high fever or your symptoms get worse."]}

Example 2 (no medication — the edge case):
Clinical notes: "Mild viral upper respiratory infection. Supportive care only, no antibiotics indicated."
Medications: (none prescribed)
Output: {"summary":"You have a mild viral cold. No medication is needed — your body will fight this off on its own.","medicationSchedule":[],"followUpSteps":["Rest and drink plenty of fluids.","Over-the-counter pain relievers can help with discomfort if needed.","See a doctor if symptoms last more than 10 days or you develop a high fever."]}

Now convert these clinical notes. Clinical notes: "${clinicalNotes}"
Medications:
${medsList}`;
}

export function buildPostVisitRetryPrompt(
  clinicalNotes: string,
  medications: { medicationName: string; dosage: string; timesPerDay: number; durationDays: number }[],
  validationError: string
): string {
  return `${buildPostVisitPrompt(clinicalNotes, medications)}

Your previous response failed schema validation with this error:
${validationError}

Return ONLY the corrected JSON object, matching the schema exactly, no other text.`;
}
