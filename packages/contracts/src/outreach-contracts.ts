import { z } from "zod";

export const outreachTargetSchema = z.enum(["job", "company", "application"]);
export type OutreachTarget = z.infer<typeof outreachTargetSchema>;

export const outreachFieldsSchema = z.object({
  to: z.union([z.literal(""), z.email().max(254)]),
  subject: z
    .string()
    .max(200)
    .regex(/^[^\r\n]*$/)
    .refine((value) => !value.includes("\0")),
  body: z.string().max(20000),
  writingExamples: z.string().max(12000),
});
export type OutreachFields = z.infer<typeof outreachFieldsSchema>;

export const outreachDraftSchema = outreachFieldsSchema.extend({
  id: z.string().uuid(),
  target: outreachTargetSchema,
  targetId: z.string(),
  updatedAt: z.string(),
});

export const outreachContextSchema = z.object({
  title: z.string(),
  company: z.string(),
  details: z.string(),
  facts: z.array(z.string()),
});

export const outreachProposalSchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/)
    .refine((value) => !value.includes("\0")),
  body: z.string().min(1).max(4000),
  evidence: z.array(z.string().min(1).max(500)).max(6),
});
