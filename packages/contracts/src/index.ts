import { z } from "zod";
import { eligibilitySchema, assessmentSchema } from "./assessment-contracts";
export * from "./assessment-contracts";
import {
  compensationSchema,
  evidenceSchema,
  sourceReferenceSchema,
  jobVersionSchema,
  observationSchema,
  duplicateSchema,
} from "./job-evidence-contracts";
export * from "./job-evidence-contracts";

export const sourceKeys = [
  "remotive",
  "jobicy",
  "arbeitnow",
  "remote-ok",
  "we-work-remotely",
  "greenhouse",
  "lever",
  "ashby",
  "public-page",
] as const;

export const sourceKeySchema = z.enum(sourceKeys);
export type SourceKey = z.infer<typeof sourceKeySchema>;

export const sourceLabels: Record<SourceKey, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  "public-page": "Public page",
  remotive: "Remotive",
  jobicy: "Jobicy",
  arbeitnow: "Arbeitnow",
  "remote-ok": "RemoteOK",
  "we-work-remotely": "We Work Remotely",
};

export const jobStatuses = ["inbox", "saved", "dismissed"] as const;
export const jobStatusSchema = z.enum(jobStatuses);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const discoverySearchSchema = z.object({
  query: z
    .string()
    .trim()
    .max(80, "Keep the search under 80 characters.")
    .default(""),
  location: z
    .string()
    .trim()
    .max(80, "Keep the location under 80 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export const jobFindInputSchema = discoverySearchSchema;
export const jobFindPortalSchema = z.object({
  key: z.string(),
  label: z.string(),
  found: z.number().int().nonnegative(),
  error: z.string().nullable(),
});
export const jobFindResultSchema = z.object({
  found: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  portals: z.array(jobFindPortalSchema),
});
export type JobFindInput = z.infer<typeof jobFindInputSchema>;
export type JobFindResult = z.infer<typeof jobFindResultSchema>;

export const jobSearchSettingsInputSchema = z.object({
  query: z.string().trim().max(120).default(""),
  location: z.string().trim().max(120).default(""),
  employmentType: z
    .enum([
      "any",
      "full-time",
      "part-time",
      "contract",
      "internship",
      "temporary",
    ])
    .default("any"),
  remoteOnly: z.boolean().default(false),
  intervalMinutes: z.number().int().min(0).max(10080).default(0),
  maxApplications: z.number().int().min(1).max(100).default(10),
  maxCompanies: z.number().int().min(1).max(100).default(5),
  enabled: z.boolean().default(false),
});
export const jobSearchSourceResultSchema = z.object({
  key: z.enum([
    "remotive",
    "jobicy",
    "arbeitnow",
    "remote-ok",
    "we-work-remotely",
  ]),
  label: z.string(),
  fetched: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  skippedDuplicates: z.number().int().nonnegative().default(0),
  skippedUnresolvedCompanies: z.number().int().nonnegative().default(0),
  skippedCompanyLimit: z.number().int().nonnegative().default(0),
  skippedApplicationLimit: z.number().int().nonnegative().default(0),
  error: z.string().nullable(),
});
export const jobSearchRunSchema = z.object({
  id: z.string(),
  status: z.enum(["completed", "partial", "failed"]),
  startedAt: z.string(),
  completedAt: z.string(),
  found: z.number().int().nonnegative(),
  insertedApplications: z.number().int().nonnegative(),
  insertedCompanies: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  sources: z.array(jobSearchSourceResultSchema),
});
export const jobSearchSettingsSchema = jobSearchSettingsInputSchema.extend({
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  latestRun: jobSearchRunSchema.nullable(),
  running: z.boolean(),
});
export type JobSearchSettingsInput = z.infer<
  typeof jobSearchSettingsInputSchema
>;
export type JobSearchSettings = z.infer<typeof jobSearchSettingsSchema>;
export type JobSearchRun = z.infer<typeof jobSearchRunSchema>;

export const jobFitVerdicts = ["strong", "possible", "weak"] as const;
export const jobFitVerdictSchema = z.enum(jobFitVerdicts);
export type JobFitVerdict = z.infer<typeof jobFitVerdictSchema>;

export const jobFitSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: jobFitVerdictSchema,
  summary: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  model: z.string(),
  analyzedAt: z.string(),
});

export type JobFit = z.infer<typeof jobFitSchema>;

export const DESCRIPTION_SUMMARY_FORMAT_VERSION = 3;

export const descriptionSummarySchema = z.object({
  text: z.string().trim().min(1).max(16000),
  formatVersion: z.number().int().positive().default(1),
  jobVersionId: z.string(),
  generatedAt: z.string(),
});
export type DescriptionSummary = z.infer<typeof descriptionSummarySchema>;

export const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  companyWebsite: z.string().url().nullable().default(null),
  location: z.string(),
  isRemote: z.boolean(),
  employmentType: z.string().nullable(),
  description: z.string(),
  descriptionSummary: descriptionSummarySchema.nullable().default(null),
  applyUrl: z.string().url(),
  postedAt: z.string().nullable(),
  status: jobStatusSchema,
  reviewedAt: z.string().nullable(),
  reviewState: z.enum(["unreviewed", "reviewed"]),
  sources: z.array(sourceKeySchema),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  fit: jobFitSchema.nullable(),
  eligibility: eligibilitySchema,
  assessment: assessmentSchema.nullable(),
  assessmentHistory: z.array(assessmentSchema),
  assessmentState: z.enum([
    "not-assessed",
    "queued",
    "running",
    "failed",
    "current",
    "stale",
    "legacy",
  ]),
  companyId: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  compensation: compensationSchema.nullable(),
  countries: z.array(z.string()),
  evidence: z.array(evidenceSchema),
  currentVersionId: z.string().nullable(),
  availability: z.enum(["open", "possibly-closed", "closed"]),
  sourceReferences: z.array(sourceReferenceSchema),
  versions: z.array(jobVersionSchema),
  observations: z.array(observationSchema),
  duplicates: z.array(duplicateSchema),
});

export type Job = z.infer<typeof jobSchema>;

export const jobsListQuerySchema = z.object({
  status: jobStatusSchema.default("inbox"),
  view: z.enum(["matches", "review", "all"]).optional(),
  search: z.string().trim().max(100).optional().default(""),
  relevance: z.enum(["target", "all"]).optional(),
  source: sourceKeySchema.optional(),
  reviewState: z.enum(["unreviewed", "reviewed"]).optional(),
  eligibility: z.enum(["meets", "clarify", "conflicts"]).optional(),
  assessment: z
    .enum([
      "not-assessed",
      "queued",
      "running",
      "failed",
      "current",
      "stale",
      "legacy",
    ])
    .optional(),
  sourceIds: z.string().max(10000).optional(),
  companyId: z.string().optional(),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]).optional(),
  postedAfter: z.string().date().optional(),
  discoveredAfter: z.string().date().optional(),
  availability: z.enum(["open", "possibly-closed", "closed"]).optional(),
  sort: z.enum(["newest", "best-fit"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type JobsListQuery = z.infer<typeof jobsListQuerySchema>;

export function defaultJobRelevance({
  status,
  view,
}: Pick<JobsListQuery, "status" | "view">): "target" | "all" {
  return status === "inbox" && (!view || view === "matches") ? "target" : "all";
}

export const jobsListResponseSchema = z.object({
  jobs: z.array(jobSchema),
  revision: z.string(),
  total: z.number().int().nonnegative(),
  collectedTotal: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});

export type JobsListResponse = z.infer<typeof jobsListResponseSchema>;

export const updateJobStatusSchema = z.object({
  status: jobStatusSchema,
});

export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;

export * from "./workspace-contracts";
export * from "./work-contracts";

export * from "./profile-catalogs";
export * from "./resume-contracts";
export * from "./company-contact-contracts";
export * from "./company-discovery-contracts";

export * from "./application-contracts";

export * from "./outreach-contracts";
