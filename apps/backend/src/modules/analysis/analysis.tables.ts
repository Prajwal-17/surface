import {
  boolean,
  jsonb,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { jobs } from "../jobs/jobs.tables";
import { jobVersions } from "../collection/collection.tables";
export const assessments = pgTable(
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
  (t) => [
    uniqueIndex("assessment_identity_unique").on(
      t.jobId,
      t.jobVersionId,
      t.profileRevision,
      t.formatVersion,
    ),
  ],
);
export const analysisSettings = pgTable("analysis_settings", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
});
