import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./config/env";
import { closeDatabase, sqliteHandle } from "./infrastructure/database/client";

export interface SurfaceServer {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export async function startSurfaceServer(): Promise<SurfaceServer> {
  const database = sqliteHandle();
  const retainedTables = new Set([
    "tracker_companies",
    "tracker_applications",
    "job_preferences",
    "profile_revisions",
  ]);
  database.exec("PRAGMA foreign_keys = OFF");
  for (const { name } of database
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]) {
    if (retainedTables.has(name) || name === "sqlite_sequence") continue;
    database.exec(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`);
  }
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(
    `UPDATE tracker_companies SET status='Listed' WHERE status IN ('To research','Outreach')`,
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS tracker_companies (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, website TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Listed', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracker_applications (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
      company_id TEXT NOT NULL REFERENCES tracker_companies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'To apply', type TEXT, description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '', employment_type TEXT NOT NULL DEFAULT '', work_mode TEXT,
      compensation TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', applied_on TEXT,
      contacted_on TEXT, follow_up_on TEXT, contact_name TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_preferences (
      id TEXT PRIMARY KEY NOT NULL, target_roles TEXT NOT NULL, preferred_skills TEXT NOT NULL DEFAULT '',
      location_preferences TEXT NOT NULL DEFAULT '', deal_breakers TEXT NOT NULL DEFAULT '',
      context TEXT, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile_revisions (
      revision INTEGER PRIMARY KEY NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  console.info("Database ready.");

  const server = serve({
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    const url = `http://${env.HOST}:${address.port}`;
    console.info(`Surface API listening on ${url}`);
    let stopped = false;
    return {
      port: address.port,
      url,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          setTimeout(resolve, 5000).unref();
        });
        await closeDatabase();
        console.info("Surface API stopped.");
      },
    };
  } catch (error) {
    await closeDatabase().catch(() => {});
    throw error;
  }
}
