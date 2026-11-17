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
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  primaryKey as sqlitePrimaryKey,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { env } from "../../config/env";

const pgRuns = pgTable("runs", {
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

const sqliteRuns = sqliteTable("runs", {
  id: sqliteText("id").primaryKey(),
  kind: sqliteText("kind")
    .$type<
      "collection" | "analysis" | "company-discovery" | "company-enrichment"
    >()
    .notNull(),
  label: sqliteText("label").notNull(),
  state: sqliteText("state")
    .$type<import("@surface/contracts").WorkItem["state"]>()
    .notNull(),
  createdAt: sqliteText("created_at").notNull(),
  completedAt: sqliteText("completed_at"),
});

const pgWorkItems = pgTable(
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
  (table) => [
    index("work_queue_idx").on(table.state, table.retryAt),
    uniqueIndex("work_active_identity")
      .on(table.identity)
      .where(sql`${table.state} IN ('queued','running')`),
  ],
);

const sqliteWorkItems = sqliteTable(
  "work_items",
  {
    id: sqliteText("id").primaryKey(),
    kind: sqliteText("kind")
      .$type<
        "collection" | "analysis" | "company-discovery" | "company-enrichment"
      >()
      .notNull(),
    sourceId: sqliteText("source_id"),
    jobId: sqliteText("job_id"),
    payload: sqliteText("payload", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    identity: sqliteText("identity").notNull(),
    state: sqliteText("state")
      .$type<import("@surface/contracts").WorkItem["state"]>()
      .notNull(),
    attempts: sqliteInteger("attempts").notNull().default(0),
    retryAt: sqliteText("retry_at").notNull(),
    error: sqliteText("error"),
    result: sqliteText("result", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    createdAt: sqliteText("created_at").notNull(),
    startedAt: sqliteText("started_at"),
    completedAt: sqliteText("completed_at"),
  },
  (table) => [
    sqliteIndex("work_queue_idx").on(table.state, table.retryAt),
    sqliteUniqueIndex("work_active_identity")
      .on(table.identity)
      .where(sql`${table.state} IN ('queued','running')`),
  ],
);

const pgRunItems = pgTable(
  "run_items",
  {
    runId: text("run_id")
      .notNull()
      .references(() => pgRuns.id),
    workId: text("work_id")
      .notNull()
      .references(() => pgWorkItems.id),
  },
  (table) => [primaryKey({ columns: [table.runId, table.workId] })],
);

const sqliteRunItems = sqliteTable(
  "run_items",
  {
    runId: sqliteText("run_id")
      .notNull()
      .references(() => sqliteRuns.id),
    workId: sqliteText("work_id")
      .notNull()
      .references(() => sqliteWorkItems.id),
  },
  (table) => [sqlitePrimaryKey({ columns: [table.runId, table.workId] })],
);

const pgSavedSearches = pgTable("saved_searches", {
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

const sqliteSavedSearches = sqliteTable("saved_searches", {
  id: sqliteText("id").primaryKey(),
  name: sqliteText("name").notNull(),
  query: sqliteText("query").notNull().default(""),
  sourceIds: sqliteText("source_ids", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  filters: sqliteText("filters", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  scheduleHours: sqliteInteger("schedule_hours").notNull().default(12),
  paused: sqliteInteger("paused", { mode: "boolean" }).notNull().default(false),
  nextDueAt: sqliteText("next_due_at"),
  createdAt: sqliteText("created_at").notNull(),
  updatedAt: sqliteText("updated_at").notNull(),
});

const pgExecutorLease = pgTable("executor_lease", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

const sqliteExecutorLease = sqliteTable("executor_lease", {
  id: sqliteText("id").primaryKey(),
  owner: sqliteText("owner").notNull(),
  expiresAt: sqliteInteger("expires_at").notNull(),
});

const pgCoordinationLocks = pgTable("coordination_locks", {
  name: text("name").primaryKey(),
});

const sqliteCoordinationLocks = sqliteTable("coordination_locks", {
  name: sqliteText("name").primaryKey(),
});

export {
  sqliteRuns,
  sqliteWorkItems,
  sqliteRunItems,
  sqliteSavedSearches,
  sqliteExecutorLease,
  sqliteCoordinationLocks,
};

export const runs =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteRuns as unknown as typeof pgRuns)
    : pgRuns;

export const workItems =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteWorkItems as unknown as typeof pgWorkItems)
    : pgWorkItems;

export const runItems =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteRunItems as unknown as typeof pgRunItems)
    : pgRunItems;

export const savedSearches =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteSavedSearches as unknown as typeof pgSavedSearches)
    : pgSavedSearches;

export const executorLease =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteExecutorLease as unknown as typeof pgExecutorLease)
    : pgExecutorLease;

export const coordinationLocks =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCoordinationLocks as unknown as typeof pgCoordinationLocks)
    : pgCoordinationLocks;
