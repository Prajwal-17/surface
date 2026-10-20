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
      .$type<import("@surface/contracts").AssessmentOutput>()
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
});
