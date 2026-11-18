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

export const workItems = sqliteTable(
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
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    identity: text("identity").notNull(),
    state: text("state")
      .$type<import("@surface/contracts").WorkItem["state"]>()
      .notNull(),
    attempts: integer("attempts").notNull().default(0),
    retryAt: text("retry_at").notNull(),
    error: text("error"),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("work_queue_idx").on(table.state, table.retryAt),
    uniqueIndex("work_active_identity")
      .on(table.identity)
      .where(sql`${table.state} IN ('queued','running')`),
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
  (table) => [primaryKey({ columns: [table.runId, table.workId] })],
);

export const executorLease = sqliteTable("executor_lease", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const coordinationLocks = sqliteTable("coordination_locks", {
  name: text("name").primaryKey(),
});
