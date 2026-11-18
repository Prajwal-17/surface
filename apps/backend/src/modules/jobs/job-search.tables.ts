import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { applications } from "../applications/applications.tables";

export const jobSearchSettings = sqliteTable("job_search_settings", {
  id: text("id").primaryKey(),
  query: text("query").notNull().default(""),
  location: text("location").notNull().default(""),
  employmentType: text("employment_type").notNull().default("any"),
  remoteOnly: integer("remote_only", { mode: "boolean" })
    .notNull()
    .default(false),
  intervalMinutes: integer("interval_minutes").notNull().default(0),
  maxApplications: integer("max_applications").notNull().default(10),
  maxCompanies: integer("max_companies").notNull().default(5),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  runningRunId: text("running_run_id"),
  updatedAt: text("updated_at").notNull(),
});

export const jobSearchRuns = sqliteTable(
  "job_search_runs",
  {
    id: text("id").primaryKey(),
    status: text("status")
      .$type<"completed" | "partial" | "failed">()
      .notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    found: integer("found").notNull().default(0),
    insertedApplications: integer("inserted_applications").notNull().default(0),
    insertedCompanies: integer("inserted_companies").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    sources: text("sources", { mode: "json" })
      .$type<import("@surface/contracts").JobSearchRun["sources"]>()
      .notNull(),
  },
  (table) => [index("job_search_runs_started_idx").on(table.startedAt)],
);

export const jobSearchSeen = sqliteTable(
  "job_search_seen",
  {
    id: text("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    source: text("source").notNull(),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    firstSeenAt: text("first_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_search_seen_canonical_url_unique").on(table.canonicalUrl),
    index("job_search_seen_application_idx").on(table.applicationId),
  ],
);
