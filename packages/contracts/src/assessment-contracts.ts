import { z } from "zod";
export const assessmentFormatVersion = 2;
export const eligibilitySchema = z.object({
  state: z.enum(["meets", "clarify", "conflicts"]),
  reasons: z.array(z.string()),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;
export const citationSchema = z
  .object({
    field: z.string().min(1).max(100),
    quote: z.string().min(1).max(1000),
  })
  .strict();
export const claimSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    kind: z.enum(["fact", "interpretation"]),
    jobEvidence: citationSchema.nullable(),
    profileEvidence: citationSchema.nullable(),
  })
  .strict();
export const assessmentOutputSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    summary: z.string().min(1).max(600),
    skillsFit: z.array(claimSchema).max(5),
    growthPotential: z.array(claimSchema).max(5),
    strengths: z.array(claimSchema).max(5),
    concerns: z.array(claimSchema).max(5),
    unansweredQuestions: z.array(z.string().min(1).max(300)).max(8),
    projectEvidence: z.array(claimSchema).max(5),
  })
  .strict();
export type AssessmentOutput = z.infer<typeof assessmentOutputSchema>;
export const assessmentSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobVersionId: z.string(),
  profileRevision: z.number(),
  formatVersion: z.number(),
  output: assessmentOutputSchema,
  model: z.string(),
  createdAt: z.string(),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export const analysisSettingsInputSchema = z.object({ paused: z.boolean() });
export const analysisSettingsSchema = analysisSettingsInputSchema.extend({
  enabled: z.boolean(),
  configured: z.boolean(),
  queued: z.number(),
});
