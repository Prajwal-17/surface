import {
  boolean,
  jsonb,
  index,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";
import { sqliteJobs } from "../jobs/jobs.tables";
import { sqliteJobSources } from "../jobs/jobs.tables";
import { jobs, jobSources } from "../jobs/jobs.tables";

const pgResources = pgTable("resources", {
  id: text("id").primaryKey(),
  url: text("url").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

const sqliteResources = sqliteTable("resources", {
  id: sqliteText("id").primaryKey(),
  url: sqliteText("url").notNull().unique(),
  createdAt: sqliteText("created_at").notNull(),
});

const pgSnapshots = pgTable("snapshots", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id")
    .notNull()
    .references(() => pgResources.id),
  hash: text("hash").notNull(),
  mediaType: text("media_type").notNull(),
  statusCode: integer("status_code").notNull(),
  byteLength: integer("byte_length").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  removedAt: text("removed_at"),
});

const sqliteSnapshots = sqliteTable("snapshots", {
  id: sqliteText("id").primaryKey(),
  resourceId: sqliteText("resource_id")
    .notNull()
    .references(() => sqliteResources.id),
  hash: sqliteText("hash").notNull(),
  mediaType: sqliteText("media_type").notNull(),
  statusCode: sqliteInteger("status_code").notNull(),
  byteLength: sqliteInteger("byte_length").notNull(),
  fetchedAt: sqliteText("fetched_at").notNull(),
  removedAt: sqliteText("removed_at"),
});

const pgObservations = pgTable(
  "observations",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    sourceReferenceId: text("source_reference_id")
      .notNull()
      .references(() => jobSources.id),
    resourceId: text("resource_id").references(() => pgResources.id),
    snapshotId: text("snapshot_id").references(() => pgSnapshots.id),
    observedAt: text("observed_at").notNull(),
    method: text("method").notNull(),
    evidence: jsonb("evidence")
      .$type<import("@surface/contracts").FieldEvidence[]>()
      .notNull(),
    incomplete: boolean("incomplete").notNull().default(false),
  },
  (table) => [index("observations_job_idx").on(table.jobId)],
);

const sqliteObservations = sqliteTable(
  "observations",
  {
    id: sqliteText("id").primaryKey(),
    jobId: sqliteText("job_id")
      .notNull()
      .references(() => sqliteJobs.id),
    sourceReferenceId: sqliteText("source_reference_id")
      .notNull()
      .references(() => sqliteJobSources.id),
    resourceId: sqliteText("resource_id").references(() => sqliteResources.id),
    snapshotId: sqliteText("snapshot_id").references(() => sqliteSnapshots.id),
    observedAt: sqliteText("observed_at").notNull(),
    method: sqliteText("method").notNull(),
    evidence: sqliteText("evidence", { mode: "json" })
      .$type<import("@surface/contracts").FieldEvidence[]>()
      .notNull(),
    incomplete: sqliteInteger("incomplete", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [sqliteIndex("observations_job_idx").on(table.jobId)],
);

const pgJobVersions = pgTable(
  "job_versions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    fingerprint: text("fingerprint").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
    observationId: text("observation_id").references(() => pgObservations.id),
  },
  (table) => [index("versions_job_idx").on(table.jobId)],
);

const sqliteJobVersions = sqliteTable(
  "job_versions",
  {
    id: sqliteText("id").primaryKey(),
    jobId: sqliteText("job_id")
      .notNull()
      .references(() => sqliteJobs.id),
    fingerprint: sqliteText("fingerprint").notNull(),
    content: sqliteText("content", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: sqliteText("created_at").notNull(),
    observationId: sqliteText("observation_id").references(
      () => sqliteObservations.id,
    ),
  },
  (table) => [sqliteIndex("versions_job_idx").on(table.jobId)],
);

const pgDuplicateDecisions = pgTable("duplicate_decisions", {
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
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const sqliteDuplicateDecisions = sqliteTable("duplicate_decisions", {
  id: sqliteText("id").primaryKey(),
  leftId: sqliteText("left_id")
    .notNull()
    .references(() => sqliteJobs.id),
  rightId: sqliteText("right_id")
    .notNull()
    .references(() => sqliteJobs.id),
  state: sqliteText("state")
    .$type<"possible" | "separate" | "merged" | "undone">()
    .notNull(),
  sourceIds: sqliteText("source_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: sqliteText("created_at").notNull(),
  updatedAt: sqliteText("updated_at").notNull(),
});

export {
  sqliteResources,
  sqliteSnapshots,
  sqliteObservations,
  sqliteJobVersions,
  sqliteDuplicateDecisions,
};

export const resources =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteResources as unknown as typeof pgResources)
    : pgResources;

export const snapshots =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteSnapshots as unknown as typeof pgSnapshots)
    : pgSnapshots;

export const observations =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteObservations as unknown as typeof pgObservations)
    : pgObservations;

export const jobVersions =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteJobVersions as unknown as typeof pgJobVersions)
    : pgJobVersions;

export const duplicateDecisions =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteDuplicateDecisions as unknown as typeof pgDuplicateDecisions)
    : pgDuplicateDecisions;
