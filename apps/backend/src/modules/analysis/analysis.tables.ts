import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { jobs } from "../jobs/jobs.tables";
import { jobVersions } from "../collection/collection.tables";
export const assessments = sqliteTable(
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
    output: text("output", { mode: "json" })
      .$type<import("../../shared/contracts").AssessmentOutput>()
      .notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("assessment_identity_unique").on(
      t.jobId,
      t.jobVersionId,
      t.profileRevision,
      t.formatVersion,
    ),
  ],
);
export const analysisSettings = sqliteTable("analysis_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  dailyLimit: integer("daily_limit").notNull().default(20),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  used: integer("used").notNull().default(0),
  nextResetAt: text("next_reset_at").notNull(),
});
export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  workId: text("work_id").notNull(),
  dispatchedAt: text("dispatched_at").notNull(),
  resetAt: text("reset_at").notNull(),
  outcome: text("outcome").notNull().default("dispatched"),
});
