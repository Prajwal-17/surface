import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../src/config/env";
import { desktopProfilePaths } from "../src/config/desktop-profile";

/**
 * Clears the development profile for a clean workspace. Preferences, profile,
 * personal settings and tracker data are kept; collected jobs, companies,
 * applications, runs and cached evidence are removed. The schema stays intact.
 */

const KEEP_TABLES = new Set([
  "__surface_sqlite_migrations",
  "analysis_settings",
  "configured_sources",
  "job_preferences",
  "job_search_settings",
  "profile_revisions",
  "tracker_applications",
  "tracker_companies",
]);

/** Cached files that belong to the removed tables. */
const CACHE_FOLDERS = ["snapshots", "company-logos"];

const profile = desktopProfilePaths(env.APP_ENV);
const databaseFile =
  process.env.SQLITE_DATABASE_FILE?.trim() || profile.database;
if (!databaseFile || databaseFile === ":memory:") {
  throw new Error(
    "Set SQLITE_DATABASE_FILE to an existing SQLite profile. This script never creates a database.",
  );
}
const path = resolve(databaseFile);
if (!existsSync(path)) throw new Error(`Database does not exist: ${path}`);
if (env.APP_ENV === "production") {
  throw new Error(
    "Refusing to reset a production profile. This script is for development data only.",
  );
}

const apply = process.argv.includes("--apply");
if (apply && process.env.CONFIRM_DEV_DATA_RESET !== "1") {
  throw new Error(
    "Reset requires --apply and CONFIRM_DEV_DATA_RESET=1 after reviewing the preflight report.",
  );
}

const database = new DatabaseSync(path, {
  readOnly: !apply,
  enableForeignKeyConstraints: true,
});
const tableNames = (
  database
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]
)
  .map((row) => row.name)
  .filter((name) => !name.startsWith("sqlite_"));
const countTable = (table: string) =>
  (
    database.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as {
      count: number;
    }
  ).count;
const counts = () =>
  Object.fromEntries(tableNames.map((table) => [table, countTable(table)]));

const before = counts();
const kept = Object.entries(before).filter(([table]) => KEEP_TABLES.has(table));
const cleared = Object.entries(before).filter(
  ([table]) => !KEEP_TABLES.has(table),
);
const cacheFolder = process.env.DATA_DIR?.trim()
  ? resolve(process.env.DATA_DIR.trim())
  : profile.data;
const cacheSizes = CACHE_FOLDERS.map((folder) => {
  const target = join(cacheFolder, folder);
  if (!existsSync(target)) return { folder, files: 0, bytes: 0 };
  const entries = readdirSync(target);
  let bytes = 0;
  for (const entry of entries) {
    const stats = statSync(join(target, entry));
    if (stats.isFile()) bytes += stats.size;
  }
  return { folder, files: entries.length, bytes };
});

console.info(
  JSON.stringify(
    {
      mode: apply ? "apply" : "preflight-only",
      database: path,
      keep: Object.fromEntries(kept),
      clear: Object.fromEntries(cleared),
      cache: cacheSizes,
      note: "Schema and migrations are retained; only rows and cached evidence are removed.",
    },
    null,
    2,
  ),
);

if (!apply) {
  console.info(
    "No data changed. Review this report before running with --apply.",
  );
  database.close();
  process.exit(0);
}

const lease = tableNames.includes("executor_lease")
  ? (database
      .prepare("SELECT owner,expires_at FROM executor_lease WHERE id='backend'")
      .get() as { owner: string; expires_at: number } | undefined)
  : undefined;
if (lease && lease.expires_at > Date.now()) {
  database.close();
  throw new Error(
    `Backend worker lease is active for ${lease.owner}; stop the backend before resetting development data.`,
  );
}

const backupPath = `${path}.before-dev-data-reset-${Date.now()}.sqlite3`;
const sqlLiteral = backupPath.replaceAll("'", "''");
database.exec(`VACUUM INTO '${sqlLiteral}'`);

database.exec("PRAGMA defer_foreign_keys = ON");
database.exec("BEGIN IMMEDIATE");
try {
  // Kept tables may still point at removed companies or jobs; clear those
  // references before their parent rows disappear.
  for (const [table] of kept) {
    const foreignKeys = database
      .prepare(`SELECT * FROM pragma_foreign_key_list(?)`)
      .all(table) as { table: string; from: string }[];
    for (const foreignKey of foreignKeys) {
      if (KEEP_TABLES.has(foreignKey.table)) continue;
      database.exec(
        `UPDATE "${table}" SET "${foreignKey.from}" = NULL WHERE "${foreignKey.from}" IS NOT NULL`,
      );
    }
  }
  for (const [table] of cleared) {
    database.exec(`DELETE FROM "${table}"`);
  }
  const hasSequence = database
    .prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
    )
    .get() as { count: number };
  if (hasSequence.count) database.exec("DELETE FROM sqlite_sequence");
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  database.close();
  throw error;
}

const violations = database.prepare("PRAGMA foreign_key_check").all();
if (violations.length) {
  database.close();
  throw new Error(
    `Foreign-key violations found after reset. Restore ${backupPath} and investigate.`,
  );
}
database.exec("VACUUM");
database.close();

let removedFiles = 0;
for (const { folder } of cacheSizes) {
  const target = join(cacheFolder, folder);
  if (!existsSync(target)) continue;
  for (const entry of readdirSync(target)) {
    const entryPath = join(target, entry);
    if (!statSync(entryPath).isFile()) continue;
    rmSync(entryPath, { force: true });
    removedFiles += 1;
  }
}

console.info(
  JSON.stringify(
    {
      mode: "complete",
      database: path,
      backup: backupPath,
      keptTables: kept.map(([table, count]) => ({ table, count })),
      clearedRows: cleared.reduce((total, [, count]) => total + count, 0),
      removedCacheFiles: removedFiles,
    },
    null,
    2,
  ),
);
