import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { db, sqlite } from "./client";
import { env } from "../../config/env";
const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle",
);
export function runMigrations(): void {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as { entries: { when: number }[] };
  const hasHistory = sqlite
    .query("SELECT name FROM sqlite_master WHERE name='__drizzle_migrations'")
    .get();
  const last = hasHistory
    ? ((
        sqlite
          .query("SELECT max(created_at) AS stamp FROM __drizzle_migrations")
          .get() as { stamp: number | null }
      ).stamp ?? 0)
    : 0;
  if (last >= journal.entries.at(-1)!.when) return;
  const hasJobs = sqlite
    .query("SELECT name FROM sqlite_master WHERE name='jobs'")
    .get();
  if (hasJobs) {
    const directory = join(dirname(env.DB_FILE_NAME), "backups");
    mkdirSync(directory, { recursive: true });
    const backup = join(directory, `pre-migration-${Date.now()}.sqlite`);
    sqlite.query("VACUUM INTO ?").run(backup);
    const verification = `${backup}.verify`;
    const copy = new Database(backup);
    copy.query("VACUUM INTO ?").run(verification);
    copy.close();
    const test = new Database(verification);
    try {
      const tables = ["jobs", "job_sources", "job_preferences"];
      const tableColumns = tables
        .map((table) => ({
          table,
          columns: (
            test.query(`PRAGMA table_info(${table})`).all() as {
              name: string;
            }[]
          )
            .map((column) => column.name)
            .filter((name) => name !== "configured_source_id"),
        }))
        .filter((entry) => entry.columns.length);
      const preserved = (database: Database) =>
        JSON.stringify(
          tableColumns.map(({ table, columns }) =>
            database
              .query(
                `SELECT ${columns.map((name) => `"${name}"`).join(",")} FROM ${table} ORDER BY id`,
              )
              .all(),
          ),
        );
      const before = preserved(test);
      migrate(drizzle(test), { migrationsFolder });
      if (before !== preserved(test))
        throw new Error(
          "Migration changed existing decisions, source links, timestamps or preferences.",
        );
      if (
        (
          test.query("PRAGMA integrity_check").get() as {
            integrity_check: string;
          }
        )?.integrity_check !== "ok" ||
        test.query("PRAGMA foreign_key_check").all().length
      )
        throw new Error("Migration copy failed integrity checks.");
    } finally {
      test.close();
      rmSync(verification, { force: true });
    }
    console.info(`Migration verified on a copy. Backup: ${backup}`);
  }
  migrate(db, { migrationsFolder });
}
if (import.meta.main) {
  runMigrations();
  console.info("Database migrations applied.");
  sqlite.close();
}
