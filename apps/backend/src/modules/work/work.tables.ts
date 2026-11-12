import {
  bigint,
  boolean,
  jsonb,
  index,
  integer,
  primaryKey,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  kind: text("kind")
    .$type<
      "collection" | "analysis" | "company-discovery" | "company-enrichment"
    >()
    .notNull(),
  label: text("label").notNull(),
  state: text("state")
    .$type<import("@surface/contracts").WorkItem["state"]>()
    .notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});
export const workItems = pgTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    kind: text("kind")
      .$type<
        "collection" | "analysis" | "company-discovery" | "company-enrichment"
      >()
      .notNull(),
    sourceId: text("source_id"),
    jobId: text("job_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    identity: text("identity").notNull(),
    state: text("state")
      .$type<import("@surface/contracts").WorkItem["state"]>()
      .notNull(),
    attempts: integer("attempts").notNull().default(0),
    retryAt: text("retry_at").notNull(),
    error: text("error"),
    result: jsonb("result").$type<Record<string, unknown>>(),
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
export const runItems = pgTable(
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
export const savedSearches = pgTable("saved_searches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  query: text("query").notNull().default(""),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  filters: jsonb("filters")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  scheduleHours: integer("schedule_hours").notNull().default(12),
  paused: boolean("paused").notNull().default(false),
  nextDueAt: text("next_due_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const executorLease = pgTable("executor_lease", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

/**
 * Transaction-scoped coordination that works identically on PostgreSQL and
 * PGlite. A row lock replaces pg_advisory_xact_lock, which depends on
 * PostgreSQL-specific advisory-lock process state.
 */
export const coordinationLocks = pgTable("coordination_locks", {
  name: text("name").primaryKey(),
});
