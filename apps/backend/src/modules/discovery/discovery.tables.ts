import type { SourceKey } from "@surface/contracts";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";

const pgDiscoveryRuns = pgTable(
  "discovery_runs",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    location: text("location"),
    status: text("status")
      .$type<"running" | "completed" | "partial" | "failed">()
      .notNull(),
    resultCount: integer("result_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [index("discovery_runs_started_at_idx").on(table.startedAt)],
);

const sqliteDiscoveryRuns = sqliteTable(
  "discovery_runs",
  {
    id: sqliteText("id").primaryKey(),
    query: sqliteText("query").notNull(),
    location: sqliteText("location"),
    status: sqliteText("status")
      .$type<"running" | "completed" | "partial" | "failed">()
      .notNull(),
    resultCount: sqliteInteger("result_count").notNull().default(0),
    insertedCount: sqliteInteger("inserted_count").notNull().default(0),
    updatedCount: sqliteInteger("updated_count").notNull().default(0),
    startedAt: sqliteText("started_at").notNull(),
    completedAt: sqliteText("completed_at"),
  },
  (table) => [sqliteIndex("discovery_runs_started_at_idx").on(table.startedAt)],
);

const pgDiscoverySourceRuns = pgTable(
  "discovery_source_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => pgDiscoveryRuns.id, { onDelete: "cascade" }),
    source: text("source").$type<SourceKey>().notNull(),
    status: text("status").$type<"success" | "failed">().notNull(),
    fetchedCount: integer("fetched_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    error: text("error"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("discovery_source_runs_run_id_idx").on(table.runId),
    index("discovery_source_runs_source_idx").on(table.source),
  ],
);

const sqliteDiscoverySourceRuns = sqliteTable(
  "discovery_source_runs",
  {
    id: sqliteText("id").primaryKey(),
    runId: sqliteText("run_id")
      .notNull()
      .references(() => sqliteDiscoveryRuns.id, { onDelete: "cascade" }),
    source: sqliteText("source").$type<SourceKey>().notNull(),
    status: sqliteText("status").$type<"success" | "failed">().notNull(),
    fetchedCount: sqliteInteger("fetched_count").notNull().default(0),
    acceptedCount: sqliteInteger("accepted_count").notNull().default(0),
    durationMs: sqliteInteger("duration_ms").notNull().default(0),
    error: sqliteText("error"),
    createdAt: sqliteText("created_at").notNull(),
  },
  (table) => [
    sqliteIndex("discovery_source_runs_run_id_idx").on(table.runId),
    sqliteIndex("discovery_source_runs_source_idx").on(table.source),
  ],
);

export { sqliteDiscoveryRuns, sqliteDiscoverySourceRuns };

export const discoveryRuns =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteDiscoveryRuns as unknown as typeof pgDiscoveryRuns)
    : pgDiscoveryRuns;

export const discoverySourceRuns =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteDiscoverySourceRuns as unknown as typeof pgDiscoverySourceRuns)
    : pgDiscoverySourceRuns;
