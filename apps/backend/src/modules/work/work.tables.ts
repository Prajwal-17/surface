import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"collection" | "analysis">().notNull(),
  label: text("label").notNull(),
  state: text("state")
    .$type<import("../../shared/contracts").WorkItem["state"]>()
    .notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});
export const workItems = sqliteTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"collection" | "analysis">().notNull(),
    sourceId: text("source_id"),
    jobId: text("job_id"),
    identity: text("identity").notNull(),
    state: text("state")
      .$type<import("../../shared/contracts").WorkItem["state"]>()
      .notNull(),
    attempts: integer("attempts").notNull().default(0),
    retryAt: text("retry_at").notNull(),
    error: text("error"),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("work_queue_idx").on(t.state, t.retryAt),
    uniqueIndex("work_active_identity")
      .on(t.identity)
      .where(sql`${t.state} IN ('queued','running')`),
  ],
);
export const runItems = sqliteTable(
  "run_items",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id),
    workId: text("work_id")
      .notNull()
      .references(() => workItems.id),
  },
  (t) => [primaryKey({ columns: [t.runId, t.workId] })],
);
export const savedSearches = sqliteTable("saved_searches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  query: text("query").notNull().default(""),
  sourceIds: text("source_ids", { mode: "json" }).$type<string[]>().notNull(),
  filters: text("filters", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  scheduleHours: integer("schedule_hours").notNull().default(12),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  nextDueAt: text("next_due_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const executorLease = sqliteTable("executor_lease", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
