import { z } from "zod";
import { profileDetailsSchema } from "./profile-catalogs";
import { scheduleHoursSchema } from "./work-contracts";
const text = z.string().trim().max(10000);
const profileText = z.string().trim().max(100000);
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
  title: profileText.min(1),
  url: z.union([publicUrlSchema, z.literal("")]),
  technologies: z.string().max(10000).default(""),
  contribution: profileText,
  results: profileText,
});
export const personalContextSchema = z.object({
  details: profileDetailsSchema.optional(),
  experience: profileText.default(""),
  yearsExperience: z.number().min(0).max(80).nullable().default(null),
  industries: profileText.default(""),
  growthInterests: profileText.default(""),
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
  compensationExpectations: profileText.default(""),
  eligibilityNotes: profileText.default(""),
  projects: z.array(projectSchema).max(50).default([]),
});
export type PersonalContext = z.infer<typeof personalContextSchema>;
export const profileInputSchema = z.object({
  targetRoles: profileText.min(2),
  preferredSkills: profileText,
  locationPreferences: profileText,
  dealBreakers: profileText,
  context: personalContextSchema,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;
export const profileSchema = profileInputSchema.extend({
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
export const companyTrackingStatusSchema = z.enum([
  "watching",
  "queued",
  "contacted",
  "ignored",
]);
export type CompanyTrackingStatus = z.infer<typeof companyTrackingStatusSchema>;
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
export const trackedCompanySchema = companySchema.extend({
  trackingStatus: companyTrackingStatusSchema,
  logoPath: z.string().nullable(),
  openRoles: z.number(),
  applicationCount: z.number(),
  newestOpening: z.string().nullable(),
});
export type TrackedCompany = z.infer<typeof trackedCompanySchema>;
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
