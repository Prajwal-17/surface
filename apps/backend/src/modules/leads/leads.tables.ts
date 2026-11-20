import type { DatabaseSync } from "node:sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companyTags = sqliteTable("company_tags", {
  companyId: text("company_id").notNull(),
  tag: text("tag").notNull(),
  createdAt: text("created_at").notNull(),
});

export const discoveryRuns = sqliteTable("discovery_runs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("discovery"),
  state: text("state").notNull().default("queued"),
  criteria: text("criteria").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  error: text("error"),
  summary: text("summary").notNull().default(""),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const discoveryRunEvents = sqliteTable("discovery_run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

export const leadSources = sqliteTable("lead_sources", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  retrievedAt: text("retrieved_at").notNull(),
  rendered: integer("rendered").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const leadEvidence = sqliteTable("lead_evidence", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  runId: text("run_id"),
  sourceId: text("source_id"),
  sourceUrl: text("source_url").notNull(),
  pageTitle: text("page_title").notNull().default(""),
  claim: text("claim").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  retrievedAt: text("retrieved_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const researchBriefs = sqliteTable("research_briefs", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  runId: text("run_id"),
  content: text("content").notNull(),
  findings: text("findings").notNull().default("[]"),
  sources: text("sources").notNull().default("[]"),
  model: text("model"),
  createdAt: text("created_at").notNull(),
});

export const leadSettings = sqliteTable("lead_settings", {
  id: text("id").primaryKey(),
  searxngUrl: text("searxng_url").notNull().default(""),
  productContext: text("product_context").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const LEAD_TABLES = [
  "company_tags",
  "discovery_runs",
  "discovery_run_events",
  "lead_sources",
  "lead_evidence",
  "research_briefs",
  "lead_settings",
] as const;

/**
 * Creates the lead discovery tables. The embedded SQLite database is
 * initialized imperatively in server.ts, so this mirrors the existing table
 * setup rather than relying on a migration runner.
 */
export function initializeLeadTables(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS company_tags (
      company_id TEXT NOT NULL REFERENCES tracker_companies(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (company_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_company_tags_tag ON company_tags(tag);

    CREATE TABLE IF NOT EXISTS discovery_runs (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL DEFAULT 'discovery',
      state TEXT NOT NULL DEFAULT 'queued',
      criteria TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      summary TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_runs_created
      ON discovery_runs(created_at);

    CREATE TABLE IF NOT EXISTS discovery_run_events (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_run_events_run
      ON discovery_run_events(run_id, created_at);

    CREATE TABLE IF NOT EXISTS lead_sources (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      retrieved_at TEXT NOT NULL,
      rendered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lead_sources_run ON lead_sources(run_id);

    CREATE TABLE IF NOT EXISTS lead_evidence (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES tracker_companies(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES discovery_runs(id) ON DELETE SET NULL,
      source_id TEXT REFERENCES lead_sources(id) ON DELETE SET NULL,
      source_url TEXT NOT NULL,
      page_title TEXT NOT NULL DEFAULT '',
      claim TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      retrieved_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lead_evidence_company
      ON lead_evidence(company_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_evidence_unique
      ON lead_evidence(company_id, source_id, claim);

    CREATE TABLE IF NOT EXISTS research_briefs (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES tracker_companies(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES discovery_runs(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      findings TEXT NOT NULL DEFAULT '[]',
      sources TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_research_briefs_company
      ON research_briefs(company_id, created_at);

    CREATE TABLE IF NOT EXISTS lead_settings (
      id TEXT PRIMARY KEY NOT NULL,
      searxng_url TEXT NOT NULL DEFAULT '',
      product_context TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);
  // Databases created before rendered fetch existed keep working: add the
  // column in place instead of requiring a migration runner.
  const leadSourceColumns = new Set(
    (database.prepare("PRAGMA table_info(lead_sources)").all() as {
      name: string;
    }[]).map((column) => column.name),
  );
  if (!leadSourceColumns.has("rendered")) {
    database.exec(
      "ALTER TABLE lead_sources ADD COLUMN rendered INTEGER NOT NULL DEFAULT 0",
    );
  }
}

export type DiscoveryRun = typeof discoveryRuns.$inferSelect;
export type DiscoveryRunEvent = typeof discoveryRunEvents.$inferSelect;
export type LeadSource = typeof leadSources.$inferSelect;
export type LeadEvidence = typeof leadEvidence.$inferSelect;
export type ResearchBrief = typeof researchBriefs.$inferSelect;
export type LeadSettings = typeof leadSettings.$inferSelect;
