import { z } from "zod";
import { compensationSchema } from "./job-evidence-contracts";

export const applicationStatusSchema = z.enum([
  "queued",
  "applied",
  "contacted",
  "in_conversation",
  "closed",
  "ignored",
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export const applicationWorkModeSchema = z.enum([
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);

const date = z.iso.date();
const applicationFields = z.object({
  title: z.string().trim().min(1).max(300),
  companyName: z.string().trim().min(1).max(300),
  companyId: z.string().min(1).nullable(),
  sourceUrl: z.url({ protocol: /^https?$/ }).nullable(),
  description: z.string().nullable(),
  publishedAt: z.string().nullable(),
  location: z.string().trim().max(400).nullable(),
  employmentType: z.string().trim().max(200).nullable(),
  workMode: applicationWorkModeSchema.nullable(),
  compensation: compensationSchema.nullable(),
  status: applicationStatusSchema,
  notes: z.string().max(20000),
  outcome: z.string().trim().max(500).nullable(),
  contactName: z.string().trim().max(250).nullable(),
  contactEmail: z.email().nullable(),
  appliedOn: date.nullable(),
  contactedOn: date.nullable(),
  followUpOn: date.nullable(),
});

export const createApplicationSchema = applicationFields.partial().required({
  title: true,
  companyName: true,
});
export const updateApplicationSchema = applicationFields.partial().extend({
  archived: z.boolean().optional(),
});

export const applicationSchema = applicationFields.extend({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  jobId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const jobApplicationInputSchema = z.object({
  status: z.enum(["queued", "applied", "ignored"]),
  appliedOn: date.optional(),
});

export type Application = z.infer<typeof applicationSchema>;
export type CreateApplication = z.infer<typeof createApplicationSchema>;
export type UpdateApplication = z.infer<typeof updateApplicationSchema>;
export type JobApplicationInput = z.infer<typeof jobApplicationInputSchema>;
