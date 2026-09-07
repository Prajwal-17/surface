import { z } from "zod";
export const compensationSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(["year", "month", "hour"]).nullable(),
  original: z.string(),
});
export type Compensation = z.infer<typeof compensationSchema>;
export const evidenceSchema = z.object({
  field: z.string(),
  value: z.string(),
  reference: z.string(),
});
export type FieldEvidence = z.infer<typeof evidenceSchema>;
export const sourceReferenceSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceUrl: z.string(),
  configuredSourceId: z.string().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  availability: z.string(),
  missingChecks: z.number(),
});
export const jobVersionSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  fingerprint: z.string(),
  content: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  observationId: z.string().nullable(),
});
export const observationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  sourceReferenceId: z.string(),
  resourceId: z.string().nullable(),
  snapshotId: z.string().nullable(),
  observedAt: z.string(),
  method: z.string(),
  evidence: z.array(evidenceSchema),
  incomplete: z.boolean(),
  rawAvailable: z.boolean(),
});
export const duplicateSchema = z.object({
  id: z.string(),
  leftId: z.string(),
  rightId: z.string(),
  state: z.enum(["possible", "separate", "merged", "undone"]),
  sourceIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
