import type { SourceKey } from "@surface/contracts";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const discoveryRuns = sqliteTable(
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

export const discoverySourceRuns = sqliteTable(
  "discovery_source_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => discoveryRuns.id, { onDelete: "cascade" }),
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
