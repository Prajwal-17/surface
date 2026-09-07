import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { jobs, jobSources } from "../jobs/jobs.tables";
export const resources = sqliteTable("resources", {
  id: text("id").primaryKey(),
  url: text("url").notNull().unique(),
  createdAt: text("created_at").notNull(),
});
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id")
    .notNull()
    .references(() => resources.id),
  hash: text("hash").notNull(),
  mediaType: text("media_type").notNull(),
  statusCode: integer("status_code").notNull(),
  byteLength: integer("byte_length").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  removedAt: text("removed_at"),
});
export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    sourceReferenceId: text("source_reference_id")
      .notNull()
      .references(() => jobSources.id),
    resourceId: text("resource_id").references(() => resources.id),
    snapshotId: text("snapshot_id").references(() => snapshots.id),
    observedAt: text("observed_at").notNull(),
    method: text("method").notNull(),
    evidence: text("evidence", { mode: "json" })
      .$type<import("../../shared/contracts").FieldEvidence[]>()
      .notNull(),
    incomplete: integer("incomplete", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("observations_job_idx").on(t.jobId)],
);
export const jobVersions = sqliteTable(
  "job_versions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    fingerprint: text("fingerprint").notNull(),
    content: text("content", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: text("created_at").notNull(),
    observationId: text("observation_id").references(() => observations.id),
  },
  (t) => [index("versions_job_idx").on(t.jobId)],
);
export const duplicateDecisions = sqliteTable("duplicate_decisions", {
  id: text("id").primaryKey(),
  leftId: text("left_id")
    .notNull()
    .references(() => jobs.id),
  rightId: text("right_id")
    .notNull()
    .references(() => jobs.id),
  state: text("state")
    .$type<"possible" | "separate" | "merged" | "undone">()
    .notNull(),
  sourceIds: text("source_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
