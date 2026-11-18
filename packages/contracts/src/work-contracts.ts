import { z } from "zod";
export const scheduleHoursSchema = z.union([
  z.literal(0),
  z.literal(6),
  z.literal(12),
  z.literal(24),
]);
export const workStateSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "interrupted",
]);
export const runSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "collection",
    "analysis",
    "company-discovery",
    "company-enrichment",
  ]),
  label: z.string(),
  state: workStateSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export const workItemSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "collection",
    "analysis",
    "company-discovery",
    "company-enrichment",
  ]),
  sourceId: z.string().nullable(),
  jobId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable().default(null),
  identity: z.string(),
  state: workStateSchema,
  attempts: z.number(),
  retryAt: z.string(),
  error: z.string().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export const runDetailSchema = runSchema.extend({
  items: z.array(workItemSchema),
});
export type WorkItem = z.infer<typeof workItemSchema>;
export const submissionSchema = z.object({ runId: z.string() });

