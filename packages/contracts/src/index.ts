import { z } from "zod";
import {
  profileDetailsSchema,
  profileLocationSchema,
} from "./profile-catalogs";

export * from "./profile-catalogs";
export * from "./resume-contracts";

export const personalContextSchema = z
  .object({
    details: profileDetailsSchema.optional(),
    yearsExperience: z.number().min(0).max(80).nullable().default(null),
    industries: z.string().max(100000).default(""),
    growthInterests: z.string().max(100000).default(""),
    workMode: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
    constraints: z
      .object({
        countries: z
          .array(z.string().trim().min(2).max(80))
          .max(50)
          .default([]),
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
    experience: z.string().max(100000).default(""),
    compensationExpectations: z.string().max(100000).default(""),
    eligibilityNotes: z.string().max(100000).default(""),
    projects: z
      .array(
        z.object({
          title: z.string().max(500).default(""),
          url: z.string().max(2048).default(""),
          technologies: z.string().max(4000).default(""),
          contribution: z.string().max(100000).default(""),
          results: z.string().max(100000).default(""),
        }),
      )
      .max(50)
      .default([]),
  })
  .passthrough();
export type PersonalContext = z.infer<typeof personalContextSchema>;

export const profileInputSchema = z.object({
  targetRoles: z.string().max(100000).default(""),
  preferredSkills: z.string().max(100000).default(""),
  locationPreferences: z.string().max(100000).default(""),
  dealBreakers: z.string().max(100000).default(""),
  context: personalContextSchema,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;
export const profileSchema = profileInputSchema.extend({
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
export const locationOptionSchema = z.object({
  countryCode: z.string(),
  cityId: z.number().nullable(),
  label: z.string(),
});
export type ProfileLocation = z.infer<typeof profileLocationSchema>;
