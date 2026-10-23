import type { JobStatus, SourceKey } from "@surface/contracts";
import {
  boolean,
  jsonb,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location").notNull().default("Location not listed"),
    isRemote: boolean("is_remote").notNull().default(false),
    employmentType: text("employment_type"),
    description: text("description").notNull().default(""),
    descriptionSummary: jsonb("description_summary").$type<
      import("@surface/contracts").DescriptionSummary
    >(),
    applyUrl: text("apply_url").notNull(),
    postedAt: text("posted_at"),
    status: text("status").$type<JobStatus>().notNull().default("inbox"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    reviewedAt: text("reviewed_at"),
    analysisRequested: boolean("analysis_requested").notNull().default(false),
    companyId: text("company_id"),
    descriptionHtml: text("description_html"),
    workMode: text("work_mode")
      .$type<"remote" | "hybrid" | "onsite" | "unknown">()
      .notNull()
      .default("unknown"),
    compensation:
      jsonb("compensation").$type<import("@surface/contracts").Compensation>(),
    countries: jsonb("countries").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence")
      .$type<import("@surface/contracts").FieldEvidence[]>()
      .notNull()
      .default([]),
    currentVersionId: text("current_version_id"),
    mergedInto: text("merged_into"),
    fitScore: integer("fit_score"),
    fitVerdict: text("fit_verdict").$type<"strong" | "possible" | "weak">(),
    fitSummary: text("fit_summary"),
    fitStrengths: jsonb("fit_strengths").$type<string[]>(),
    fitConcerns: jsonb("fit_concerns").$type<string[]>(),
    fitModel: text("fit_model"),
    fitAnalyzedAt: text("fit_analyzed_at"),
  },
  (table) => [
    uniqueIndex("jobs_dedupe_key_unique").on(table.dedupeKey),
    index("jobs_canonical_url_idx").on(table.canonicalUrl),
    index("jobs_status_idx").on(table.status),
    index("jobs_posted_at_idx").on(table.postedAt),
  ],
);

export const jobSources = pgTable(
  "job_sources",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").$type<SourceKey>().notNull(),
    configuredSourceId: text("configured_source_id"),
    availability: text("availability").notNull().default("unknown"),
    missingChecks: integer("missing_checks").notNull().default(0),
    sourceRecordKey: text("source_record_key").notNull(),
    externalId: text("external_id"),
    sourceUrl: text("source_url").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_sources_record_key_unique").on(table.sourceRecordKey),
    index("job_sources_job_id_idx").on(table.jobId),
    index("job_sources_source_idx").on(table.source),
  ],
);
