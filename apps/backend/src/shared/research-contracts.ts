import { z } from "zod";
import { companySchema, publicUrlSchema } from "./workspace-contracts";
export const researchStateSchema = z.enum([
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "interrupted",
]);
export const researchSourceSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  runId: z.string(),
  url: z.string(),
  title: z.string(),
  kind: z.enum(["search", "page"]),
  text: z.string(),
  links: z.array(z.object({ url: z.string(), title: z.string() })),
  status: z.string(),
  retrievedAt: z.string(),
});
export const researchReportSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  runId: z.string(),
  markdown: z.string(),
  sourceIds: z.array(z.string()),
  model: z.string(),
  createdAt: z.string(),
});
export const researchMessageSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  runId: z.string(),
  question: z.string(),
  answer: z.string().nullable(),
  webSearch: z.boolean(),
  sourceIds: z.array(z.string()),
  createdAt: z.string(),
});
export const researchRunSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  kind: z.enum(["report", "question", "links"]),
  state: researchStateSchema,
  draft: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export const researchEventSchema = z.object({
  id: z.number(),
  runId: z.string(),
  type: z.enum(["progress", "text", "done"]),
  text: z.string(),
  createdAt: z.string(),
});
export const verifiedCompanyLinkSchema = z.object({
  url: publicUrlSchema,
  label: z.string(),
  category: z.enum(["Website", "Careers", "Code", "Social", "Docs"]),
  reason: z.string(),
  sourceId: z.string(),
  checkedAt: z.string(),
});
export type VerifiedCompanyLink = z.infer<typeof verifiedCompanyLinkSchema>;
export const companyLinkReviewSchema = z.object({
  companyId: z.string(),
  runId: z.string(),
  links: z.array(verifiedCompanyLinkSchema),
  checkedAt: z.string(),
});
export const researchDetailSchema = z.object({
  linkReview: companyLinkReviewSchema.nullable(),
  company: companySchema,
  reports: z.array(researchReportSchema),
  sources: z.array(researchSourceSchema),
  messages: z.array(researchMessageSchema),
  runs: z.array(researchRunSchema),
});
export const researchListSchema = z.array(
  z.object({
    company: companySchema,
    report: researchReportSchema.nullable(),
    run: researchRunSchema.nullable(),
  }),
);
export const researchCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.union([publicUrlSchema, z.literal("")]),
  companyId: z.string().optional(),
  description: z.string().default(""),
});
export const researchResolveSchema = z.object({
  companyId: z.string().nullable(),
  candidates: z.array(researchCandidateSchema),
});
export const researchQuestionInputSchema = z.object({
  question: z.string().trim().min(1).max(12000),
  webSearch: z.boolean().default(false),
});
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type ResearchDetail = z.infer<typeof researchDetailSchema>;
export type ResearchCandidate = z.infer<typeof researchCandidateSchema>;
export type ResearchEvent = z.infer<typeof researchEventSchema>;
