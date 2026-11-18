import { z } from "zod";
import { projectSchema } from "./workspace-contracts";
import { skillOptions, profileLocationSchema } from "./profile-catalogs";
export const resumeDraftSchema = z.object({
  name: z.string().max(200),
  residence: profileLocationSchema.nullable(),
  experience: z.string().max(100000),
  education: z.string().max(100000),
  skills: z.array(z.enum(skillOptions)),
  projects: z.array(projectSchema).max(50),
  unmatched: z.array(z.string().max(10000)).max(100),
});
export const resumeResponseSchema = z.object({
  draft: resumeDraftSchema,
  sourceText: z.string(),
  model: z.string(),
  skillEvidence: z
    .array(z.object({ skill: z.enum(skillOptions), evidence: z.string() }))
    .optional(),
});
export type ResumeDraft = z.infer<typeof resumeDraftSchema>;

export const resumeImportResponseSchema = z.union([
  resumeResponseSchema,
  z.object({
    needsText: z.literal(true),
    sourceText: z.string(),
    message: z.string(),
  }),
]);
