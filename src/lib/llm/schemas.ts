import { z } from "zod";

export const UrgencySchema = z.enum(["Low", "Medium", "High"]);

export const PreVisitOutputSchema = z.object({
  urgency: UrgencySchema,
  chiefComplaint: z.string().min(1).max(300),
  questions: z.array(z.string().min(1).max(200)).length(3),
});
export type PreVisitOutput = z.infer<typeof PreVisitOutputSchema>;

export const PostVisitOutputSchema = z.object({
  summary: z.string().min(1).max(2000),
  medicationSchedule: z.array(
    z.object({
      medication: z.string().min(1),
      dosage: z.string().min(1),
      schedule: z.string().min(1),
    })
  ),
  followUpSteps: z.array(z.string().min(1)).min(1),
});
export type PostVisitOutput = z.infer<typeof PostVisitOutputSchema>;
