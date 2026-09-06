import { z } from "zod";

export const sourceKeys = [
  "remotive",
  "jobicy",
  "arbeitnow",
  "remote-ok",
  "we-work-remotely",
] as const;

export const sourceKeySchema = z.enum(sourceKeys);
export type SourceKey = z.infer<typeof sourceKeySchema>;

export const sourceLabels: Record<SourceKey, string> = {
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
    .min(2, "Enter at least 2 characters.")
    .max(80, "Keep the search under 80 characters."),
  location: z
    .string()
    .trim()
    .max(80, "Keep the location under 80 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export type DiscoverySearchInput = z.infer<typeof discoverySearchSchema>;

export const sourceRunSummarySchema = z.object({
  source: sourceKeySchema,
  label: z.string(),
  status: z.enum(["success", "failed"]),
  fetchedCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  error: z.string().nullable(),
});

export type SourceRunSummary = z.infer<typeof sourceRunSummarySchema>;

export const discoveryRunSummarySchema = z.object({
  id: z.string(),
  query: z.string(),
  location: z.string().nullable(),
  status: z.enum(["completed", "partial", "failed"]),
  resultCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  completedAt: z.string(),
});

export type DiscoveryRunSummary = z.infer<typeof discoveryRunSummarySchema>;

export const discoverySearchResponseSchema = z.object({
  run: discoveryRunSummarySchema,
  sources: z.array(sourceRunSummarySchema),
  insertedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
});

export type DiscoverySearchResponse = z.infer<
  typeof discoverySearchResponseSchema
>;

export const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  isRemote: z.boolean(),
  employmentType: z.string().nullable(),
  description: z.string(),
  applyUrl: z.string().url(),
  postedAt: z.string().nullable(),
  status: jobStatusSchema,
  sources: z.array(sourceKeySchema),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});

export type Job = z.infer<typeof jobSchema>;

export const jobsListQuerySchema = z.object({
  status: jobStatusSchema.default("inbox"),
  search: z.string().trim().max(100).optional().default(""),
  source: sourceKeySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type JobsListQuery = z.infer<typeof jobsListQuerySchema>;

export const jobsListResponseSchema = z.object({
  jobs: z.array(jobSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});

export type JobsListResponse = z.infer<typeof jobsListResponseSchema>;

export const updateJobStatusSchema = z.object({
  status: jobStatusSchema,
});

export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;

export const jobPreferencesInputSchema = z.object({
  targetRoles: z
    .string()
    .trim()
    .min(2, "Enter at least one target role.")
    .max(1_000, "Keep target roles under 1,000 characters."),
  preferredSkills: z
    .string()
    .trim()
    .max(2_000, "Keep preferred skills under 2,000 characters."),
  locationPreferences: z
    .string()
    .trim()
    .max(1_000, "Keep location preferences under 1,000 characters."),
  dealBreakers: z
    .string()
    .trim()
    .max(2_000, "Keep deal-breakers under 2,000 characters."),
});

export type JobPreferencesInput = z.infer<typeof jobPreferencesInputSchema>;

export const jobPreferencesSchema = jobPreferencesInputSchema.extend({
  updatedAt: z.string(),
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;

export const jobPreferencesResponseSchema = z.object({
  preferences: jobPreferencesSchema.nullable(),
});

export type JobPreferencesResponse = z.infer<
  typeof jobPreferencesResponseSchema
>;
