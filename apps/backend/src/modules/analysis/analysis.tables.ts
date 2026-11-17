import {
  boolean,
  jsonb,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";
import { sqliteJobVersions } from "../collection/collection.tables";
import { sqliteJobs } from "../jobs/jobs.tables";
import { jobVersions } from "../collection/collection.tables";
import { jobs } from "../jobs/jobs.tables";
const pgAssessments = pgTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    jobVersionId: text("job_version_id")
      .notNull()
      .references(() => jobVersions.id),
    profileRevision: integer("profile_revision").notNull(),
    formatVersion: integer("format_version").notNull(),
    output: jsonb("output")
      .$type<import("@surface/contracts").AssessmentOutput>()
      .notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("assessment_identity_unique").on(
      table.jobId,
      table.jobVersionId,
      table.profileRevision,
      table.formatVersion,
    ),
  ],
);

const sqliteAssessments = sqliteTable(
  "assessments",
  {
    id: sqliteText("id").primaryKey(),
    jobId: sqliteText("job_id")
      .notNull()
      .references(() => sqliteJobs.id),
    jobVersionId: sqliteText("job_version_id")
      .notNull()
      .references(() => sqliteJobVersions.id),
    profileRevision: sqliteInteger("profile_revision").notNull(),
    formatVersion: sqliteInteger("format_version").notNull(),
    output: sqliteText("output", { mode: "json" })
      .$type<import("@surface/contracts").AssessmentOutput>()
      .notNull(),
    model: sqliteText("model").notNull(),
    createdAt: sqliteText("created_at").notNull(),
  },
  (table) => [
    sqliteUniqueIndex("assessment_identity_unique").on(
      table.jobId,
      table.jobVersionId,
      table.profileRevision,
      table.formatVersion,
    ),
  ],
);

const pgAnalysisSettings = pgTable("analysis_settings", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
});

const sqliteAnalysisSettings = sqliteTable("analysis_settings", {
  id: sqliteText("id").primaryKey(),
  enabled: sqliteInteger("enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  paused: sqliteInteger("paused", { mode: "boolean" }).notNull().default(false),
});

export { sqliteAssessments, sqliteAnalysisSettings };

export const assessments =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteAssessments as unknown as typeof pgAssessments)
    : pgAssessments;

export const analysisSettings =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteAnalysisSettings as unknown as typeof pgAnalysisSettings)
    : pgAnalysisSettings;
