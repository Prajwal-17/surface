import { z } from "zod";
import { scheduleHoursSchema } from "./work-contracts";
const text = z.string().trim().max(10000);
export const publicUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((v) => {
    if (!URL.canParse(v)) return false;
    const u = new URL(v);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  }, "Use an HTTP(S) URL without credentials.");
export const projectSchema = z.object({
  title: text.min(1),
  url: z.union([publicUrlSchema, z.literal("")]),
  contribution: text,
  results: text,
});
export const personalContextSchema = z.object({
  experience: text.default(""),
  yearsExperience: z.number().min(0).max(80).nullable().default(null),
  industries: text.default(""),
  growthInterests: text.default(""),
  workMode: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
  constraints: z
    .object({
      countries: z.array(z.string().trim().min(2).max(80)).max(50).default([]),
      workMode: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
      minimumSalary: z.number().nonnegative().nullable().default(null),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("INR"),
      salaryPeriod: z.enum(["year", "month", "hour"]).default("year"),
      employmentTypes: z
        .array(
          z.enum([
            "full-time",
            "part-time",
            "contract",
            "internship",
            "temporary",
          ]),
        )
        .default([]),
    })
    .default({
      countries: [],
      workMode: "any",
      minimumSalary: null,
      currency: "INR",
      salaryPeriod: "year",
      employmentTypes: [],
    }),
  compensationExpectations: text.default(""),
  eligibilityNotes: text.default(""),
  projects: z.array(projectSchema).max(50).default([]),
});
export type PersonalContext = z.infer<typeof personalContextSchema>;
export const profileInputSchema = z.object({
  targetRoles: text.min(2),
  preferredSkills: text,
  locationPreferences: text,
  dealBreakers: text,
  context: personalContextSchema,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;
export const profileSchema = profileInputSchema.extend({
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.union([publicUrlSchema, z.literal("")]).default(""),
  notes: text.default(""),
  watchReason: text.default(""),
  archived: z.boolean().default(false),
});
export const companySchema = companyInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Company = z.infer<typeof companySchema>;
export const providerSchema = z.enum([
  "greenhouse",
  "lever",
  "ashby",
  "remotive",
  "jobicy",
  "arbeitnow",
  "remote-ok",
  "we-work-remotely",
  "public-page",
  "unsupported",
]);
export const sourceInspectionSchema = z.object({
  url: publicUrlSchema,
  provider: providerSchema,
  boardIdentity: z.string().nullable(),
  endpoint: publicUrlSchema,
  support: z.enum(["supported", "unverified", "unsupported"]),
  reason: z.string(),
});
export type SourceInspection = z.infer<typeof sourceInspectionSchema>;
export const sourceInputSchema = z.object({
  url: publicUrlSchema,
  companyId: z.string().nullable().default(null),
  label: z.string().trim().max(200).default(""),
  paused: z.boolean().default(false),
  scheduleHours: scheduleHoursSchema.default(12),
});
export const configuredSourceSchema = sourceInspectionSchema.extend({
  id: z.string(),
  companyId: z.string().nullable(),
  label: z.string(),
  paused: z.boolean(),
  scheduleHours: scheduleHoursSchema.default(12),
  nextDueAt: z.string().nullable().default(null),
  lastSuccessAt: z.string().nullable().default(null),
  retryAt: z.string().nullable().default(null),
  failureCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConfiguredSource = z.infer<typeof configuredSourceSchema>;
export const inspectUrlsSchema = z.object({
  urls: z.array(publicUrlSchema).min(1).max(50),
});
