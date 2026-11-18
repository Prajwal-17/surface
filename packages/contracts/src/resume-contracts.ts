import { z } from "zod";
import { skillOptions, profileLocationSchema } from "./profile-catalogs";

const projectSchema = z.object({
  title: z.string().max(500).default(""),
  url: z.string().max(2048).default(""),
  technologies: z.string().max(4000).default(""),
  contribution: z.string().max(100000).default(""),
  results: z.string().max(100000).default(""),
});
export const publicUrlSchema = z.string().url().max(2048);
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
  skillEvidence: z.array(z.object({ skill: z.enum(skillOptions), evidence: z.string() })).optional(),
});
export type ResumeDraft = z.infer<typeof resumeDraftSchema>;
export const resumeImportResponseSchema = z.union([
  resumeResponseSchema,
  z.object({ needsText: z.literal(true), sourceText: z.string(), message: z.string() }),
]);
