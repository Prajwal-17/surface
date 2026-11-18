import { z } from "zod";
import { profileDetailsSchema, profileLocationSchema } from "./profile-catalogs";

export * from "./profile-catalogs";
export * from "./resume-contracts";

export const personalContextSchema = z.object({
  details: profileDetailsSchema.default({}),
  constraints: z.object({
    countries: z.array(z.string()).default([]),
    currency: z.string().default("USD"),
  }).default({}),
  experience: z.string().max(100000).default(""),
  projects: z.array(z.object({
    title: z.string().max(500).default(""),
    url: z.string().max(2048).default(""),
    technologies: z.string().max(4000).default(""),
    contribution: z.string().max(100000).default(""),
    results: z.string().max(100000).default(""),
  })).max(50).default([]),
}).passthrough();
export type PersonalContext = z.infer<typeof personalContextSchema>;

export const profileInputSchema = z.object({
  targetRoles: z.string().max(100000).default(""),
  preferredSkills: z.string().max(100000).default(""),
  locationPreferences: z.string().max(100000).default(""),
  dealBreakers: z.string().max(100000).default(""),
  context: personalContextSchema.default({}),
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
