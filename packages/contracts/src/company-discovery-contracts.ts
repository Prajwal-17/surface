import { z } from "zod";
import { companySchema, publicUrlSchema } from "./workspace-contracts";
import {
  companyContactSchema,
  companyEvidenceSchema,
} from "./company-contact-contracts";
export const companyReviewStateSchema = z.enum([
  "new",
  "will_apply",
  "done",
  "skipped",
]);
export const companySearchInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    source: z.enum(["funding", "yc"]),
    keywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    stages: z
      .array(
        z.enum([
          "pre-seed",
          "seed",
          "series-a",
          "series-b",
          "series-c",
          "growth",
        ]),
      )
      .max(6)
      .default([]),
    recencyDays: z.number().int().min(1).max(365).default(30),
    batches: z
      .array(z.string().regex(/^(Winter|Spring|Summer|Fall) 20\d{2}$/))
      .max(20)
      .default([]),
    geography: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    fundingSources: z
      .array(
        z.enum(["techcrunch", "venturebeat", "businesswire", "prnewswire"]),
      )
      .min(1)
      .max(4)
      .default(["techcrunch"]),
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default("09:00"),
    timezone: z
      .string()
      .refine((v) => {
        try {
          return Boolean(
            new Intl.DateTimeFormat("en", { timeZone: v }).resolvedOptions()
              .timeZone,
          );
        } catch {
          return false;
        }
      }, "Choose a valid timezone.")
      .default("Asia/Kolkata"),
    schedule: z.enum(["daily", "manual"]).default("daily"),
    paused: z.boolean().default(false),
  })
  .refine((v) => v.source !== "yc" || v.batches.length > 0, {
    message: "Select at least one YC batch.",
    path: ["batches"],
  });
export const companyResultCountsSchema = z.object({
  new: z.number(),
  updated: z.number(),
  unresolved: z.number(),
  failed: z.number(),
  filtered: z.number().default(0),
});
export const companySearchSchema = companySearchInputSchema.safeExtend({
  id: z.string(),
  revision: z.number(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  latestRunId: z.string().nullable(),
  latestCounts: companyResultCountsSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const companySignalSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  identity: z.string(),
  kind: z.enum(["funding", "yc", "manual"]),
  provider: z.string(),
  providerId: z.string().nullable(),
  batch: z.string().nullable(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  stage: z.string().nullable(),
  announcementDate: z.string().nullable(),
  publicationDate: z.string().nullable(),
  firstDiscoveredAt: z.string(),
  lastSeenAt: z.string(),
  evidence: z.array(companyEvidenceSchema),
});
export const companyActionInputSchema = z
  .object({
    kind: z.enum([
      "will_apply",
      "applied",
      "contacted",
      "skipped",
      "reopened",
      "deferred",
    ]),
    contactId: z.string().nullable().default(null),
    jobId: z.string().nullable().default(null),
    note: z.string().max(10000).default(""),
    deferredUntil: z.iso.datetime().nullable().default(null),
    requestId: z.uuid(),
  })
  .refine((v) => v.kind !== "deferred" || Boolean(v.deferredUntil), {
    message: "Choose a reminder date.",
  });
export const companyActionSchema = companyActionInputSchema.safeExtend({
  id: z.string(),
  companyId: z.string(),
  createdAt: z.string(),
});
export const companyOpportunitySchema = companySchema.extend({
  description: z.string(),
  normalizedWebsite: z.string().nullable(),
  reviewState: companyReviewStateSchema,
  deferredUntil: z.string().nullable(),
  logoPath: z.string().nullable(),
  logoSourceUrl: z.string().nullable(),
  logoFetchedAt: z.string().nullable(),
  logoKind: z.string().nullable(),
  enrichedAt: z.string().nullable(),
  detailsCheckedAt: z.string().nullable(),
  contactsCheckedAt: z.string().nullable(),
  enrichmentError: z.string().nullable(),
  signals: z.array(companySignalSchema),
  contactCount: z.number(),
  jobCount: z.number(),
  research: z.object({
    reportCount: z.number().int().nonnegative(),
    latestReportAt: z.string().nullable(),
    state: z.enum(["none", "running", "saved", "failed"]),
  }),
});
export const companyDetailSchema = companyOpportunitySchema.extend({
  contacts: z.array(companyContactSchema),
  actions: z.array(companyActionSchema),
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      location: z.string(),
      applyUrl: z.string(),
      availability: z.string(),
      relevant: z.boolean(),
    }),
  ),
  searches: z.array(z.object({ id: z.string(), name: z.string() })),
  enrichmentPending: z.boolean(),
});
export const companyListSchema = z.object({
  items: z.array(companyOpportunitySchema),
  total: z.number(),
  counts: z.record(z.string(), z.number()),
  page: z.number(),
  pageSize: z.number(),
});
export const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  website: z.union([publicUrlSchema, z.literal("")]).optional(),
  description: z.string().max(10000).optional(),
  notes: z.string().max(20000).optional(),
  watchReason: z.string().max(20000).optional(),
  deferredUntil: z.iso.datetime().nullable().optional(),
  archived: z.boolean().optional(),
});
export const companyIntakeSchema = z
  .object({
    urls: z.array(publicUrlSchema).max(100).default([]),
    csv: z.string().max(250000).default(""),
  })
  .refine(
    (v) => v.urls.length > 0 || Boolean(v.csv.trim()),
    "Paste a URL or import a CSV.",
  );
export type CompanyDiscoverySearch = z.infer<typeof companySearchSchema>;
export type CompanySearchInput = z.infer<typeof companySearchInputSchema>;
export type CompanySignal = z.infer<typeof companySignalSchema>;
export type CompanyOpportunity = z.infer<typeof companyOpportunitySchema>;
export type CompanyDetail = z.infer<typeof companyDetailSchema>;
export type CompanyResultCounts = z.infer<typeof companyResultCountsSchema>;
