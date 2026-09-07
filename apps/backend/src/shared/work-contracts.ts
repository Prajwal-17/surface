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
  kind: z.enum(["collection", "analysis"]),
  label: z.string(),
  state: workStateSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export const workItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["collection", "analysis"]),
  sourceId: z.string().nullable(),
  jobId: z.string().nullable(),
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
export const savedSearchInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  query: z.string().trim().max(100).default(""),
  sourceIds: z.array(z.string()).min(1).max(100),
  filters: z.record(z.string(), z.string()).default({}),
  scheduleHours: scheduleHoursSchema.default(12),
  paused: z.boolean().default(false),
});
export const savedSearchSchema = savedSearchInputSchema.extend({
  id: z.string(),
  nextDueAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedSearch = z.infer<typeof savedSearchSchema>;
