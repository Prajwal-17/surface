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
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";

const pgJobs = pgTable(
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

const sqliteJobs = sqliteTable(
  "jobs",
  {
    id: sqliteText("id").primaryKey(),
    dedupeKey: sqliteText("dedupe_key").notNull(),
    canonicalUrl: sqliteText("canonical_url").notNull(),
    title: sqliteText("title").notNull(),
    company: sqliteText("company").notNull(),
    location: sqliteText("location").notNull().default("Location not listed"),
    isRemote: sqliteInteger("is_remote", { mode: "boolean" })
      .notNull()
      .default(false),
    employmentType: sqliteText("employment_type"),
    description: sqliteText("description").notNull().default(""),
    descriptionSummary: sqliteText("description_summary", {
      mode: "json",
    }).$type<import("@surface/contracts").DescriptionSummary>(),
    applyUrl: sqliteText("apply_url").notNull(),
    postedAt: sqliteText("posted_at"),
    status: sqliteText("status").$type<JobStatus>().notNull().default("inbox"),
    firstSeenAt: sqliteText("first_seen_at").notNull(),
    lastSeenAt: sqliteText("last_seen_at").notNull(),
    createdAt: sqliteText("created_at").notNull(),
    updatedAt: sqliteText("updated_at").notNull(),
    reviewedAt: sqliteText("reviewed_at"),
    analysisRequested: sqliteInteger("analysis_requested", { mode: "boolean" })
      .notNull()
      .default(false),
    companyId: sqliteText("company_id"),
    descriptionHtml: sqliteText("description_html"),
    workMode: sqliteText("work_mode")
      .$type<"remote" | "hybrid" | "onsite" | "unknown">()
      .notNull()
      .default("unknown"),
    compensation: sqliteText("compensation", {
      mode: "json",
    }).$type<import("@surface/contracts").Compensation>(),
    countries: sqliteText("countries", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    evidence: sqliteText("evidence", { mode: "json" })
      .$type<import("@surface/contracts").FieldEvidence[]>()
      .notNull()
      .default([]),
    currentVersionId: sqliteText("current_version_id"),
    mergedInto: sqliteText("merged_into"),
    fitScore: sqliteInteger("fit_score"),
    fitVerdict: sqliteText("fit_verdict").$type<
      "strong" | "possible" | "weak"
    >(),
    fitSummary: sqliteText("fit_summary"),
    fitStrengths: sqliteText("fit_strengths", { mode: "json" }).$type<
      string[]
    >(),
    fitConcerns: sqliteText("fit_concerns", { mode: "json" }).$type<string[]>(),
    fitModel: sqliteText("fit_model"),
    fitAnalyzedAt: sqliteText("fit_analyzed_at"),
  },
  (table) => [
    sqliteUniqueIndex("jobs_dedupe_key_unique").on(table.dedupeKey),
    sqliteIndex("jobs_canonical_url_idx").on(table.canonicalUrl),
    sqliteIndex("jobs_status_idx").on(table.status),
    sqliteIndex("jobs_posted_at_idx").on(table.postedAt),
  ],
);

const pgJobSources = pgTable(
  "job_sources",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => pgJobs.id, { onDelete: "cascade" }),
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

const sqliteJobSources = sqliteTable(
  "job_sources",
  {
    id: sqliteText("id").primaryKey(),
    jobId: sqliteText("job_id")
      .notNull()
      .references(() => sqliteJobs.id, { onDelete: "cascade" }),
    source: sqliteText("source").$type<SourceKey>().notNull(),
    configuredSourceId: sqliteText("configured_source_id"),
    availability: sqliteText("availability").notNull().default("unknown"),
    missingChecks: sqliteInteger("missing_checks").notNull().default(0),
    sourceRecordKey: sqliteText("source_record_key").notNull(),
    externalId: sqliteText("external_id"),
    sourceUrl: sqliteText("source_url").notNull(),
    firstSeenAt: sqliteText("first_seen_at").notNull(),
    lastSeenAt: sqliteText("last_seen_at").notNull(),
  },
  (table) => [
    sqliteUniqueIndex("job_sources_record_key_unique").on(
      table.sourceRecordKey,
    ),
    sqliteIndex("job_sources_job_id_idx").on(table.jobId),
    sqliteIndex("job_sources_source_idx").on(table.source),
  ],
);

export { sqliteJobs, sqliteJobSources };

export const jobs =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteJobs as unknown as typeof pgJobs)
    : pgJobs;

export const jobSources =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteJobSources as unknown as typeof pgJobSources)
    : pgJobSources;
