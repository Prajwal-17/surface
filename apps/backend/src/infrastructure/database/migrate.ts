import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveMigrationsFolder, sqliteHandle, type Database } from "./client";

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

const SQLITE_MIGRATIONS_TABLE = "__surface_sqlite_migrations";

export async function runMigrations(): Promise<string> {
  const migrationsFolder = resolveMigrationsFolder();
  runSqliteMigrations(migrationsFolder);
  return migrationsFolder;
}

/** Applies migrations in order using the existing SQLite history. */
function runSqliteMigrations(migrationsFolder: string): void {
  const database = sqliteHandle();
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    dialect?: string;
    entries: JournalEntry[];
  };
  if (journal.dialect !== "sqlite") {
    throw new Error(
      `Expected SQLite migrations in ${migrationsFolder}, found ${journal.dialect ?? "unknown"}.`,
    );
  }
  database.exec(
    `CREATE TABLE IF NOT EXISTS ${SQLITE_MIGRATIONS_TABLE} (
      idx INTEGER PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      hash TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );
  const applied = new Set(
    (
      database
        .prepare(`SELECT idx FROM ${SQLITE_MIGRATIONS_TABLE} ORDER BY idx`)
        .all() as { idx: number }[]
    ).map((row) => row.idx),
  );
  for (const entry of journal.entries.toSorted((a, b) => a.idx - b.idx)) {
    if (applied.has(entry.idx)) continue;
    const file = join(migrationsFolder, `${entry.tag}.sql`);
    if (!existsSync(file)) {
      throw new Error(
        `SQLite migration ${entry.tag} is missing from ${migrationsFolder}.`,
      );
    }
    const sqlText = readFileSync(file, "utf8");
    const hash = createHash("sha256").update(sqlText).digest("hex");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sqlText);
      database
        .prepare(
          `INSERT INTO ${SQLITE_MIGRATIONS_TABLE} (idx, tag, hash, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(entry.idx, entry.tag, hash, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    console.info(`Applied SQLite migration ${entry.tag}.`);
  }
  const integrity = database.prepare("PRAGMA integrity_check").get() as {
    integrity_check?: string;
  };
  if (integrity.integrity_check !== "ok") {
    throw new Error(
      `SQLite integrity check failed: ${integrity.integrity_check ?? "unknown"}.`,
    );
  }
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) {
    throw new Error("SQLite foreign-key check failed after migrations.");
  }
}

export type { Database };
