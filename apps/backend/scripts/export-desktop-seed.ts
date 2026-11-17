/**
 * One-off development seed exporter.
 *
 * Copies every public application row from a PostgreSQL Surface database into a
 * fresh SQLite database and copies the snapshot files that those rows reference.
 * This is intentionally separate from the packaged app's normal storage path:
 * the desktop app never reads PostgreSQL.
 *
 * Usage:
 *   PRODUCTION_DATABASE_URL=postgresql://... \
 *   PRODUCTION_DATA_DIR=/path/to/data \
 *   node --import tsx scripts/export-desktop-seed.ts /tmp/surface-dev-seed
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const outputDirectory = resolve(process.argv[2] ?? "desktop-dev-seed");
const databaseUrl =
  process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
const sourceDataDirectory = process.env.PRODUCTION_DATA_DIR;
const migrationsDirectory = resolve("apps/backend/drizzle-sqlite");
const migrationsTable = "__surface_sqlite_migrations";

if (!databaseUrl)
  throw new Error("Set PRODUCTION_DATABASE_URL to the production database.");
const parsedUrl = new URL(databaseUrl);
if (decodeURIComponent(parsedUrl.pathname.slice(1)) !== "surface-data")
  throw new Error(
    "Refusing to export: PRODUCTION_DATABASE_URL must point at the surface-data database.",
  );

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(join(outputDirectory, "data"), { recursive: true });
const databaseFile = join(outputDirectory, "surface.sqlite3");
const database = new DatabaseSync(databaseFile);
database.exec("PRAGMA journal_mode=DELETE");
database.exec("PRAGMA foreign_keys=OFF");
applySqliteMigrations(database, migrationsDirectory);

const sql = postgres(databaseUrl, { max: 1 });
let totalRows = 0;
try {
  const sqliteTables = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '${migrationsTable}'
       ORDER BY name`,
    )
    .all() as { name: string }[];
  const postgresColumns = await sql<
    { table_name: string; column_name: string }[]
  >`SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
    ORDER BY table_name, ordinal_position`;
  const pg = new Map<string, Set<string>>();
  for (const column of postgresColumns) {
    const set = pg.get(column.table_name) ?? new Set<string>();
    set.add(column.column_name);
    pg.set(column.table_name, set);
  }
  const pgTables = new Set(pg.keys());

  for (const { name: table } of sqliteTables) {
    if (!pgTables.has(table)) {
      console.info(`skip ${table}: not present in PostgreSQL`);
      continue;
    }
    const sqliteColumns = (
      database.prepare(`PRAGMA table_info("${table}")`).all() as {
        name: string;
      }[]
    ).map((column) => column.name);
    const available = pg.get(table)!;
    const columns = sqliteColumns.filter((column) => available.has(column));
    const ignored = [
      ...sqliteColumns.filter((column) => !available.has(column)),
      ...[...available].filter((column) => !sqliteColumns.includes(column)),
    ];
    if (ignored.length)
      console.info(
        `note ${table}: ignoring schema-only columns ${ignored.join(", ")}`,
      );
    if (!columns.length) {
      console.info(`skip ${table}: no shared columns`);
      continue;
    }
    const rows = await sql.unsafe(
      `SELECT ${columns.map((column) => `"${column}"`).join(", ")} FROM "${table}"`,
    );
    if (!rows.length) {
      console.info(`${table}: 0 rows`);
      continue;
    }
    const placeholders = columns.map(() => "?").join(", ");
    const insert = database.prepare(
      `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")})
       VALUES (${placeholders})`,
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows)
        insert.run(
          ...columns.map((column) =>
            serializeValue((row as Record<string, unknown>)[column]),
          ),
        );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw new Error(`Failed copying ${table}: ${String(error)}`, {
        cause: error,
      });
    }
    totalRows += rows.length;
    console.info(`${table}: ${rows.length} rows`);
  }
} finally {
  await sql.end({ timeout: 5 });
}

const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
if (foreignKeys.length)
  throw new Error(`Foreign-key check failed: ${foreignKeys.length} row(s).`);
const integrity = database.prepare("PRAGMA integrity_check").get() as {
  integrity_check?: string;
};
if (integrity.integrity_check !== "ok")
  throw new Error(
    `SQLite integrity check failed: ${integrity.integrity_check}`,
  );
database.exec("PRAGMA foreign_keys=ON");
database.close();

if (sourceDataDirectory) {
  for (const folder of ["snapshots", "company-logos"]) {
    const source = join(sourceDataDirectory, folder);
    if (existsSync(source))
      cpSync(source, join(outputDirectory, "data", folder), {
        recursive: true,
      });
  }
}

console.info(
  `Wrote ${totalRows} rows to ${databaseFile}${sourceDataDirectory ? ` and copied files from ${sourceDataDirectory}` : ""}.`,
);

function applySqliteMigrations(db: DatabaseSync, directory: string) {
  const journalPath = join(directory, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    dialect?: string;
    entries: { idx: number; tag: string }[];
  };
  if (journal.dialect !== "sqlite")
    throw new Error(`Expected SQLite migrations in ${directory}.`);
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      idx INTEGER PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      hash TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );
  for (const entry of journal.entries.toSorted((a, b) => a.idx - b.idx)) {
    const sqlText = readFileSync(join(directory, `${entry.tag}.sql`), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sqlText);
      db.prepare(
        `INSERT INTO ${migrationsTable} (idx, tag, hash, applied_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        entry.idx,
        entry.tag,
        createHash("sha256").update(sqlText).digest("hex"),
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function serializeValue(
  value: unknown,
): string | number | bigint | Uint8Array | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}
