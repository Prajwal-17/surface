/**
 * Copies a Surface PostgreSQL database and its snapshot files into a desktop
 * Electron profile's SQLite database without modifying PostgreSQL.
 *
 * The desktop app uses its own from-scratch SQLite schema. This command applies
 * that schema to a fresh staging database, copies every common table in foreign
 * key order, and verifies the result with per-table row digests before the
 * staging database can be installed.
 *
 * Usage:
 *   node --import tsx scripts/import-desktop-data.ts export \
 *     --database-url postgresql://.../surface-data \
 *     --data-dir ../../data \
 *     --staging /path/to/import-staging
 *
 *   node --import tsx scripts/import-desktop-data.ts install \
 *     --staging /path/to/import-staging \
 *     --target-profile "$HOME/.config/Surface" \
 *     --replace
 *
 *   node --import tsx scripts/import-desktop-data.ts migrate \
 *     --database-url postgresql://.../surface-data \
 *     --data-dir ../../data \
 *     --target-profile "$HOME/.config/Surface" \
 *     --replace
 *
 * The source connection is always a REPEATABLE READ, READ ONLY transaction.
 * Snapshots are copied to staging first; the target profile is only changed by
 * `install`, which backs up the existing database before atomically replacing
 * it. The production database, its files, and any existing desktop profile are
 * never deleted.
 */
// oxlint-disable-next-line import/no-unassigned-import -- load .env before configuration is evaluated
import "dotenv/config";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(here, "..");
const repositoryDirectory = resolve(backendDirectory, "../..");
const defaultMigrationsDirectory = join(backendDirectory, "drizzle-sqlite");
const migrationsTable = "__surface_sqlite_migrations";
const importFormat = "surface-postgres-to-sqlite-import";
const importFormatVersion = 1;
const chunkSize = 500;
const snapshotFolder = "snapshots";
const logoFolder = "company-logos";

type Command = "export" | "install" | "migrate" | "verify";

interface CommandOptions {
  command: Command;
  databaseUrl?: string;
  dataDirectory: string;
  stagingDirectory: string;
  targetProfile: string;
  replace: boolean;
  skipSnapshots: boolean;
  allowAnyDatabase: boolean;
  report?: string;
}

interface SourceColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

interface SourceTable {
  name: string;
  columns: SourceColumn[];
}

interface SqliteColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKeyOrder: number;
}

interface SqliteTable {
  name: string;
  columns: SqliteColumn[];
}

interface TableDigest {
  name: string;
  rows: number;
  digest: string;
}

interface SnapshotCheck {
  referenced: number;
  uniqueHashes: number;
  filesVerified: number;
  totalBytes: number;
}

interface ImportReport {
  format: typeof importFormat;
  formatVersion: typeof importFormatVersion;
  createdAt: string;
  source: {
    database: string;
    host: string;
    dataDirectory: string;
  };
  staging: {
    database: string;
    dataDirectory: string;
  };
  migrations: {
    entries: number;
    table: string;
  };
  tables: TableDigest[];
  sourceOnlyTables: string[];
  targetOnlyTables: string[];
  snapshots: SnapshotCheck;
  schema: {
    tables: number;
    columns: number;
    foreignKeys: number;
  };
  warnings: string[];
}

const options = parseCommandOptions(process.argv.slice(2));
if (options.command === "export" || options.command === "migrate") {
  await runExport(options);
} else if (options.command === "install") {
  await runInstall(options);
} else {
  verifyInstalledProfile(options);
}

function parseCommandOptions(argv: string[]): CommandOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "database-url": { type: "string" },
      "data-dir": { type: "string" },
      staging: { type: "string" },
      "target-profile": { type: "string" },
      report: { type: "string" },
      replace: { type: "boolean", default: false },
      "skip-snapshots": { type: "boolean", default: false },
      "allow-any-database": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    printHelp();
    process.exit(0);
  }
  const command = positionals[0];
  if (
    command !== "export" &&
    command !== "install" &&
    command !== "migrate" &&
    command !== "verify"
  ) {
    printHelp();
    throw new Error("Choose one command: export, install, migrate, or verify.");
  }
  if (positionals.length > 1) {
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  }

  const targetProfile = resolve(
    values["target-profile"] ??
      process.env.SURFACE_DESKTOP_USER_DATA ??
      join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        "Surface",
      ),
  );
  const dataDirectory = resolve(
    values["data-dir"] ??
      process.env.DATA_DIR ??
      join(repositoryDirectory, "data"),
  );
  const databaseUrl =
    values["database-url"] ??
    process.env.PRODUCTION_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (command === "migrate" && !values.staging) {
    mkdirSync(targetProfile, { recursive: true, mode: 0o700 });
  }
  const stagingDirectory = values.staging
    ? resolve(values.staging)
    : command === "migrate"
      ? mkdtempSync(join(targetProfile, ".surface-import-"))
      : undefined;

  if (command === "install" && !stagingDirectory) {
    throw new Error("install requires --staging.");
  }
  if (command === "export" && !stagingDirectory) {
    throw new Error("export requires --staging.");
  }
  if (command === "migrate" && !stagingDirectory) {
    throw new Error("migrate could not create a staging directory.");
  }

  return {
    command,
    databaseUrl,
    dataDirectory,
    stagingDirectory: stagingDirectory!,
    targetProfile,
    replace: values.replace ?? false,
    skipSnapshots: values["skip-snapshots"] ?? false,
    allowAnyDatabase: values["allow-any-database"] ?? false,
    report: values.report ? resolve(values.report) : undefined,
  };
}

function printHelp(): void {
  console.info(`Surface PostgreSQL to desktop SQLite import

Commands:
  export    Build and verify a staging SQLite profile from PostgreSQL.
  install   Back up a desktop profile and install a verified staging profile.
  migrate   export and then install in one run.
  verify    Recheck an installed profile against an import report.

Options:
  --database-url <url>    Source PostgreSQL URL. Defaults to
                          PRODUCTION_DATABASE_URL or DATABASE_URL.
  --data-dir <path>       Source DATA_DIR containing snapshots/. Defaults to
                          DATA_DIR or the repository data/ directory.
  --staging <path>        Staging directory. export and install require it;
                          migrate creates one under the target profile.
  --target-profile <path> Electron userData directory. Defaults to
                          $SURFACE_DESKTOP_USER_DATA or ~/.config/Surface.
  --report <path>         import-report.json used by verify.
  --replace               Replace an existing target surface.sqlite3. The old
                          database and WAL files are backed up first.
  --skip-snapshots        Do not copy snapshot files. The report will still
                          verify that the source snapshot files are present.
  --allow-any-database    Allow a source database other than surface-data.
  -h, --help              Show this help.
`);
}

async function runExport(
  commandOptions: CommandOptions,
): Promise<ImportReport> {
  const staging = commandOptions.stagingDirectory;
  if (existsSync(join(staging, "surface.sqlite3"))) {
    throw new Error(
      `Refusing to reuse an existing staging database at ${join(staging, "surface.sqlite3")}. Choose a new --staging directory.`,
    );
  }
  if (!commandOptions.databaseUrl) {
    throw new Error(
      "Set PRODUCTION_DATABASE_URL, DATABASE_URL, or --database-url.",
    );
  }
  assertProductionDatabase(
    commandOptions.databaseUrl,
    commandOptions.allowAnyDatabase,
  );

  mkdirSync(staging, { recursive: true, mode: 0o700 });
  const stagingDatabase = join(staging, "surface.sqlite3");
  const stagingData = join(staging, "data");
  const database = new DatabaseSync(stagingDatabase, { readBigInts: true });
  database.exec("PRAGMA journal_mode=DELETE");
  database.exec("PRAGMA foreign_keys=OFF");
  applySqliteMigrations(database, defaultMigrationsDirectory);
  database.exec("PRAGMA foreign_keys=ON");
  chmodSync(stagingDatabase, 0o600);

  const sourceTables = await readSourceSchema(commandOptions.databaseUrl);
  const targetTables = readSqliteSchema(database);
  validateSchemas(sourceTables, targetTables, database);
  const foreignKeyOrder = orderByForeignKeys(database, sourceTables);

  const sql = postgres(commandOptions.databaseUrl, {
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
  });
  const sourceDigests = new Map<string, Map<string, string>>();
  const sourceCounts = new Map<string, number>();
  database.exec("BEGIN IMMEDIATE");
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      for (const table of foreignKeyOrder) {
        const result = await exportTable(
          tx,
          sourceTables.get(table)!,
          targetTables.get(table)!,
          database,
        );
        sourceDigests.set(table, result.rows);
        sourceCounts.set(table, result.rows.size);
      }
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const targetDigests = new Map<string, Map<string, string>>();
  for (const table of foreignKeyOrder) {
    targetDigests.set(
      table,
      readSqliteRows(database, targetTables.get(table)!),
    );
  }
  verifyTableDigests(sourceDigests, targetDigests);
  fixResearchEventSequence(database, targetTables.get("research_events"));
  verifyConstraints(database);

  const sourceOnlyTables = [...sourceTables.keys()].filter(
    (table) => !targetTables.has(table),
  );
  const targetOnlyTables = [...targetTables.keys()].filter(
    (table) => !sourceTables.has(table),
  );
  if (sourceOnlyTables.length) {
    throw new Error(
      `Source tables have no SQLite counterpart: ${sourceOnlyTables.join(", ")}.`,
    );
  }
  for (const table of targetOnlyTables) {
    const count = scalar(
      database,
      `SELECT CAST(count(*) AS INTEGER) AS value FROM ${quoteIdentifier(table)}`,
    );
    if (count !== 0) {
      throw new Error(
        `Target-only table ${table} is not empty (${count} rows). Refusing to continue.`,
      );
    }
  }

  const snapshotResult = commandOptions.skipSnapshots
    ? verifySnapshotsWithoutCopy(database, commandOptions.dataDirectory)
    : copyAndVerifySnapshots(
        database,
        commandOptions.dataDirectory,
        join(stagingData, snapshotFolder),
      );
  const warnings = verifyCompanyLogos(
    database,
    commandOptions.dataDirectory,
    join(stagingData, logoFolder),
  );
  if (targetOnlyTables.length) {
    warnings.push(
      `SQLite-only tables left empty: ${targetOnlyTables.join(", ")}.`,
    );
  }

  const tables: TableDigest[] = [...sourceTables.keys()]
    .toSorted()
    .map((name) => ({
      name,
      rows: sourceCounts.get(name) ?? 0,
      digest: digestRowHashes(sourceDigests.get(name)!),
    }));
  const report: ImportReport = {
    format: importFormat,
    formatVersion: importFormatVersion,
    createdAt: new Date().toISOString(),
    source: {
      database: databaseName(commandOptions.databaseUrl),
      host: databaseHost(commandOptions.databaseUrl),
      dataDirectory: commandOptions.dataDirectory,
    },
    staging: {
      database: stagingDatabase,
      dataDirectory: stagingData,
    },
    migrations: {
      entries: migrationEntryCount(defaultMigrationsDirectory),
      table: migrationsTable,
    },
    tables,
    sourceOnlyTables,
    targetOnlyTables,
    snapshots: snapshotResult,
    schema: sqliteSchemaStats(database),
    warnings,
  };
  database.close();
  chmodSync(stagingDatabase, 0o600);
  writeFileSync(
    join(staging, "import-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.info(
    `Verified ${tables.length} tables and ${tables.reduce((total, table) => total + table.rows, 0)} rows.`,
  );
  console.info(`Staging profile: ${staging}`);
  if (commandOptions.command === "export") {
    console.info(
      `Install it with: node --import tsx scripts/import-desktop-data.ts install --staging "${staging}" --target-profile "${commandOptions.targetProfile}" --replace`,
    );
    return report;
  }
  installStaging(commandOptions, staging);
  return report;
}

async function runInstall(
  commandOptions: CommandOptions,
): Promise<ImportReport> {
  return installStaging(commandOptions, commandOptions.stagingDirectory);
}

function verifyInstalledProfile(commandOptions: CommandOptions): void {
  const databaseFile = join(
    resolve(commandOptions.targetProfile),
    "surface.sqlite3",
  );
  const reportFiles = commandOptions.report
    ? [commandOptions.report]
    : latestReports(commandOptions.targetProfile);
  if (!reportFiles.length) {
    throw new Error("verify needs --report pointing at an import-report.json.");
  }
  const report = JSON.parse(
    readFileSync(reportFiles[0]!, "utf8"),
  ) as ImportReport;
  if (
    report.format !== importFormat ||
    report.formatVersion !== importFormatVersion
  ) {
    throw new Error("Unsupported import report format.");
  }
  const database = new DatabaseSync(databaseFile, {
    readOnly: true,
    readBigInts: true,
  });
  try {
    verifyConstraints(database);
    verifyReportedRowCounts(database, report);
    const schema = readSqliteSchema(database);
    for (const table of report.tables) {
      const targetTable = schema.get(table.name);
      if (!targetTable) {
        throw new Error(`Installed database is missing table ${table.name}.`);
      }
      const digest = digestRowHashes(readSqliteRows(database, targetTable));
      if (digest !== table.digest) {
        throw new Error(
          `Installed table ${table.name} digest changed: ${digest}, expected ${table.digest}.`,
        );
      }
    }
    for (const table of report.targetOnlyTables) {
      const count = scalar(
        database,
        `SELECT CAST(count(*) AS INTEGER) AS value FROM ${quoteIdentifier(table)}`,
      );
      if (count !== 0) {
        throw new Error(`SQLite-only table ${table} is not empty: ${count}.`);
      }
    }
    verifySnapshotContents(database, join(dirname(databaseFile), "data"));
    const migrations = scalar(
      database,
      `SELECT CAST(count(*) AS INTEGER) AS value FROM ${migrationsTable}`,
    );
    if (migrations !== report.migrations.entries) {
      throw new Error(
        `Installed database has ${migrations} migration records, expected ${report.migrations.entries}.`,
      );
    }
  } finally {
    database.close();
  }
  console.info(`Verified installed profile: ${databaseFile}`);
  console.info(
    `${report.tables.length} tables and ${report.tables.reduce((total, table) => total + table.rows, 0)} rows match ${reportFiles[0]}.`,
  );
}

function latestReports(targetProfile: string): string[] {
  const directory = join(targetProfile, "import-backups");
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name, "import-report.json"))
    .filter((file) => existsSync(file))
    .map((file) => ({ file, modified: statSync(file).mtimeMs }))
    .toSorted((left, right) => right.modified - left.modified)
    .map((entry) => entry.file);
}

function installStaging(
  commandOptions: CommandOptions,
  stagingInput: string,
): ImportReport {
  const staging = resolve(stagingInput);
  const stagingDatabase = join(staging, "surface.sqlite3");
  const reportFile = join(staging, "import-report.json");
  if (!existsSync(stagingDatabase) || !existsSync(reportFile)) {
    throw new Error(
      `Staging directory ${staging} is missing surface.sqlite3 or import-report.json.`,
    );
  }
  const stagingWal = `${stagingDatabase}-wal`;
  if (existsSync(stagingWal) && statSync(stagingWal).size > 0) {
    throw new Error(
      `Staging database still has a write-ahead log (${stagingWal}). Re-run export so the database is closed cleanly before installing.`,
    );
  }
  const report = JSON.parse(readFileSync(reportFile, "utf8")) as ImportReport;
  if (
    report.format !== importFormat ||
    report.formatVersion !== importFormatVersion
  ) {
    throw new Error("Unsupported staging import report format.");
  }
  verifyStagedDatabase(stagingDatabase, report);

  const targetProfile = resolve(commandOptions.targetProfile);
  const targetDatabase = join(targetProfile, "surface.sqlite3");
  const targetData = join(targetProfile, "data");
  mkdirSync(targetProfile, { recursive: true, mode: 0o700 });

  if (existsSync(targetDatabase) && !commandOptions.replace) {
    throw new Error(
      `Refusing to replace ${targetDatabase} without --replace. It will be backed up first.`,
    );
  }
  assertNoProcessUsingDatabase(targetDatabase);
  assertDatabaseNotOpen(targetDatabase);

  // Snapshot files are additive and content-addressed. Copy and verify them
  // before moving the existing database, so a failed copy leaves the profile
  // fully usable.
  const stagedSnapshots = join(staging, "data", snapshotFolder);
  const targetSnapshots = join(targetData, snapshotFolder);
  if (existsSync(stagedSnapshots)) {
    mkdirSync(targetSnapshots, { recursive: true, mode: 0o700 });
    cpSync(stagedSnapshots, targetSnapshots, {
      recursive: true,
      force: true,
      preserveTimestamps: true,
    });
  }
  const stagedLogos = join(staging, "data", logoFolder);
  if (existsSync(stagedLogos)) {
    mkdirSync(join(targetData, logoFolder), {
      recursive: true,
      mode: 0o700,
    });
    cpSync(stagedLogos, join(targetData, logoFolder), {
      recursive: true,
      force: true,
      preserveTimestamps: true,
    });
  }
  verifySnapshotFiles(stagingDatabase, targetData);

  const backupDirectory = join(
    targetProfile,
    "import-backups",
    new Date().toISOString().replace(/[-:.]/g, ""),
  );
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backupFiles: { name: string; bytes: number; sha256: string }[] = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${targetDatabase}${suffix}`;
    if (!existsSync(file)) continue;
    const name = `surface.sqlite3${suffix}`;
    const destination = join(backupDirectory, name);
    renameSync(file, destination);
    backupFiles.push({
      name,
      bytes: statSync(destination).size,
      sha256: fileSha256(destination),
    });
  }
  writeFileSync(
    join(backupDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        format: importFormat,
        createdAt: new Date().toISOString(),
        targetProfile,
        replacedDatabase: existsSync(join(backupDirectory, "surface.sqlite3")),
        files: backupFiles,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  try {
    moveIntoPlace(stagingDatabase, targetDatabase);
  } catch (error) {
    const backupDatabase = join(backupDirectory, "surface.sqlite3");
    let restored = false;
    if (existsSync(backupDatabase) && !existsSync(targetDatabase)) {
      renameSync(backupDatabase, targetDatabase);
      restored = true;
    }
    throw new Error(
      `Could not install the staged database. Previous database: ${restored ? "restored" : "left in the backup directory"}. Backup: ${backupDirectory}`,
      { cause: error },
    );
  }
  try {
    fsyncDirectory(targetProfile);
  } catch (error) {
    console.warn(
      `Warning: could not fsync ${targetProfile}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const installedReport = {
    ...report,
    installedAt: new Date().toISOString(),
    targetProfile,
    targetDatabase,
    backupDirectory,
    backupFiles,
  };
  writeFileSync(
    join(backupDirectory, "import-report.json"),
    `${JSON.stringify(installedReport, null, 2)}\n`,
    { mode: 0o600 },
  );
  verifyInstalledDatabase(targetDatabase, report);
  rmSync(staging, { recursive: true, force: true });
  console.info(`Installed SQLite database: ${targetDatabase}`);
  console.info(`Previous profile backup: ${backupDirectory}`);
  console.info(
    `Verified ${report.tables.length} tables and ${report.tables.reduce((total, table) => total + table.rows, 0)} rows.`,
  );
  return report;
}

async function exportTable(
  tx: postgres.TransactionSql,
  source: SourceTable,
  target: SqliteTable,
  database: DatabaseSync,
): Promise<{ rows: Map<string, string> }> {
  const columns = target.columns;
  const expressions = columns
    .map((column, index) => {
      const sourceColumn = source.columns.find(
        (candidate) => candidate.name === column.name,
      )!;
      return `${sourceExpression(column, sourceColumn)} AS "c${index}"`;
    })
    .join(", ");
  const order = columns
    .filter((column) => column.primaryKeyOrder > 0)
    .toSorted((a, b) => a.primaryKeyOrder - b.primaryKeyOrder)
    .map((column) => quoteIdentifier(column.name))
    .join(", ");
  if (!order) throw new Error(`Table ${source.name} has no primary key.`);
  const query = `SELECT ${expressions} FROM ${quoteIdentifier(source.name)} ORDER BY ${order} LIMIT $1 OFFSET $2`;
  const insert = database.prepare(
    `INSERT INTO ${quoteIdentifier(source.name)} (${columns
      .map((column) => quoteIdentifier(column.name))
      .join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  );
  const rows = new Map<string, string>();
  let offset = 0;
  for (;;) {
    const batch = (await tx.unsafe(query, [chunkSize, offset])) as Record<
      string,
      string | null
    >[];
    if (!batch.length) break;
    for (const row of batch) {
      const values = columns.map((column, index) =>
        sourceSqliteValue(source.name, column, row[`c${index}`] ?? null),
      );
      const key = rowKey(columns, values);
      if (rows.has(key)) {
        throw new Error(`Duplicate primary key in ${source.name}: ${key}`);
      }
      rows.set(key, rowDigest(values));
      insert.run(
        ...columns.map((column, index) =>
          insertValue(column, values[index] ?? null),
        ),
      );
    }
    offset += batch.length;
    if (batch.length < chunkSize) break;
  }
  return { rows };
}

function sourceExpression(target: SqliteColumn, source: SourceColumn): string {
  const column = quoteIdentifier(source.name);
  const affinity = sqliteAffinity(target);
  switch (source.dataType) {
    case "text":
    case "character varying":
    case "character":
    case "citext":
    case "uuid":
    case "json":
    case "jsonb":
    case "date":
    case "time":
    case "timestamp":
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "time with time zone":
    case "time without time zone":
      if (affinity === "text") {
        return `${column}::text`;
      }
      break;
    case "boolean":
      if (affinity === "integer") {
        return `CASE WHEN ${column} THEN '1' ELSE '0' END`;
      }
      break;
    case "smallint":
    case "integer":
    case "bigint":
      if (affinity === "integer" || affinity === "text") {
        return `${column}::text`;
      }
      break;
    case "bytea":
      if (affinity === "blob") {
        return `encode(${column}, 'hex')`;
      }
      break;
    default:
      break;
  }
  throw new Error(
    `Unsupported column mapping for ${source.name} (${source.dataType} -> ${target.type}).`,
  );
}

function sourceSqliteValue(
  table: string,
  column: SqliteColumn,
  value: string | null,
): string | null {
  if (value === null) {
    if (column.notNull) {
      throw new Error(
        `Source ${table}.${column.name} is NOT NULL in SQLite but contains a null.`,
      );
    }
    return null;
  }
  const affinity = sqliteAffinity(column);
  if (affinity === "integer") {
    if (!/^-?\d+$/.test(value)) {
      throw new Error(
        `Source ${table}.${column.name} is not an integer: ${value.slice(0, 80)}`,
      );
    }
    return String(BigInt(value));
  }
  if (affinity === "blob") {
    if (!/^[0-9a-f]*$/i.test(value) || value.length % 2 !== 0) {
      throw new Error(`Source ${table}.${column.name} is not valid bytea hex.`);
    }
    return value.toLowerCase();
  }
  return value;
}

function insertValue(
  column: SqliteColumn,
  value: string | null,
): SQLInputValue {
  if (value === null) return null;
  const affinity = sqliteAffinity(column);
  if (affinity === "integer") return BigInt(value);
  if (affinity === "blob") return Buffer.from(value, "hex");
  return value;
}

function readSqliteRows(
  database: DatabaseSync,
  table: SqliteTable,
): Map<string, string> {
  const columns = table.columns;
  const statement = database.prepare(
    `SELECT ${columns
      .map((column) => quoteIdentifier(column.name))
      .join(", ")} FROM ${quoteIdentifier(table.name)}`,
  );
  const rows = new Map<string, string>();
  for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
    const values = columns.map((column) =>
      sqliteValueToCanonical(table.name, column, row[column.name]),
    );
    const key = rowKey(columns, values);
    if (rows.has(key)) {
      throw new Error(`Duplicate primary key in SQLite ${table.name}: ${key}`);
    }
    rows.set(key, rowDigest(values));
  }
  return rows;
}

function sqliteValueToCanonical(
  table: string,
  column: SqliteColumn,
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    if (column.notNull) {
      throw new Error(
        `SQLite ${table}.${column.name} is NOT NULL but contains a null.`,
      );
    }
    return null;
  }
  const affinity = sqliteAffinity(column);
  if (affinity === "integer") {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return String(value);
    }
    throw new Error(
      `SQLite ${table}.${column.name} is not an exact integer: ${String(value)}`,
    );
  }
  if (affinity === "blob") {
    if (value instanceof Uint8Array) {
      return Buffer.from(value).toString("hex");
    }
    throw new Error(`SQLite ${table}.${column.name} is not a blob.`);
  }
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  throw new Error(
    `SQLite ${table}.${column.name} has an unexpected value: ${String(value)}`,
  );
}

function rowKey(columns: SqliteColumn[], values: (string | null)[]): string {
  return JSON.stringify(
    columns
      .map((column, index) => ({ column, value: values[index] }))
      .filter(({ column }) => column.primaryKeyOrder > 0)
      .toSorted((a, b) => a.column.primaryKeyOrder - b.column.primaryKeyOrder)
      .map(({ value }) => value),
  );
}

function rowDigest(values: (string | null)[]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function digestRowHashes(rows: Map<string, string>): string {
  const entries = [...rows.entries()].toSorted(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const hash = createHash("sha256");
  for (const [key, value] of entries) {
    hash.update(key).update("\0").update(value).update("\n");
  }
  return hash.digest("hex");
}

function verifyTableDigests(
  source: Map<string, Map<string, string>>,
  target: Map<string, Map<string, string>>,
): void {
  const problems: string[] = [];
  for (const [table, sourceRows] of source) {
    const targetRows = target.get(table);
    if (!targetRows) {
      problems.push(`${table}: missing from SQLite`);
      continue;
    }
    const sourceDigest = digestRowHashes(sourceRows);
    const targetDigest = digestRowHashes(targetRows);
    if (sourceRows.size !== targetRows.size || sourceDigest !== targetDigest) {
      const sourceOnly = [...sourceRows.keys()].filter(
        (key) => !targetRows.has(key),
      );
      const targetOnly = [...targetRows.keys()].filter(
        (key) => !sourceRows.has(key),
      );
      const changed = [...sourceRows.keys()].filter(
        (key) =>
          targetRows.has(key) && targetRows.get(key) !== sourceRows.get(key),
      );
      problems.push(
        `${table}: source ${sourceRows.size} rows ${sourceDigest.slice(0, 12)}, target ${targetRows.size} rows ${targetDigest.slice(0, 12)}; missing=${sourceOnly.length}, extra=${targetOnly.length}, changed=${changed.length}`,
      );
      if (sourceOnly.length) {
        problems.push(
          `  ${table} missing keys: ${sourceOnly.slice(0, 5).join(", ")}`,
        );
      }
      if (targetOnly.length) {
        problems.push(
          `  ${table} extra keys: ${targetOnly.slice(0, 5).join(", ")}`,
        );
      }
      if (changed.length) {
        problems.push(
          `  ${table} changed keys: ${changed.slice(0, 5).join(", ")}`,
        );
      }
    }
  }
  if (problems.length) {
    throw new Error(`Row verification failed:\n${problems.join("\n")}`);
  }
}

async function readSourceSchema(
  databaseUrl: string,
): Promise<Map<string, SourceTable>> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
  });
  try {
    const rows = await sql<
      {
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }[]
    >`SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name NOT LIKE '__drizzle%'
        ORDER BY c.table_name, c.ordinal_position`;
    const byTable = new Map<string, SourceTable>();
    for (const row of rows) {
      let table = byTable.get(row.table_name);
      if (!table) {
        table = { name: row.table_name, columns: [] };
        byTable.set(row.table_name, table);
      }
      table.columns.push({
        name: row.column_name,
        dataType: row.data_type,
        nullable: row.is_nullable === "YES",
      });
    }
    return byTable;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function readSqliteSchema(database: DatabaseSync): Map<string, SqliteTable> {
  const names = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name <> ?
       ORDER BY name`,
    )
    .all(migrationsTable) as { name: string }[];
  const tables = new Map<string, SqliteTable>();
  for (const { name } of names) {
    const columns = (
      database.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[]
    ).map((column) => ({
      name: column.name,
      type: column.type.toLowerCase(),
      notNull: Number(column.notnull) === 1,
      primaryKeyOrder: Number(column.pk),
    }));
    tables.set(name, { name, columns });
  }
  return tables;
}

function validateSchemas(
  source: Map<string, SourceTable>,
  target: Map<string, SqliteTable>,
  database: DatabaseSync,
): void {
  for (const [name, sourceTable] of source) {
    const targetTable = target.get(name);
    if (!targetTable) {
      throw new Error(
        `PostgreSQL table ${name} has no SQLite counterpart; its rows would be lost.`,
      );
    }
    const sourceColumns = new Set(
      sourceTable.columns.map((column) => column.name),
    );
    const targetColumns = new Set(
      targetTable.columns.map((column) => column.name),
    );
    const missing = [...sourceColumns].filter(
      (column) => !targetColumns.has(column),
    );
    const extra = [...targetColumns].filter(
      (column) => !sourceColumns.has(column),
    );
    if (missing.length || extra.length) {
      throw new Error(
        `Schema mismatch for ${name}: SQLite is missing [${missing.join(", ")}]; PostgreSQL is missing [${extra.join(", ")}].`,
      );
    }
    for (const targetColumn of targetTable.columns) {
      const sourceColumn = sourceTable.columns.find(
        (column) => column.name === targetColumn.name,
      )!;
      sourceExpression(targetColumn, sourceColumn);
    }
  }
  for (const name of target.keys()) {
    if (source.has(name)) continue;
    const count = scalar(
      database,
      `SELECT CAST(count(*) AS INTEGER) AS value FROM ${quoteIdentifier(name)}`,
    );
    if (count !== 0) {
      throw new Error(
        `SQLite table ${name} is not present in PostgreSQL but already contains ${count} rows.`,
      );
    }
  }
}

function orderByForeignKeys(
  database: DatabaseSync,
  tables: Map<string, SourceTable>,
): string[] {
  const dependencies = new Map<string, Set<string>>();
  for (const name of tables.keys()) dependencies.set(name, new Set());
  for (const name of tables.keys()) {
    const foreignKeys = database
      .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)
      .all() as { table: string }[];
    for (const { table: parent } of foreignKeys) {
      if (parent !== name && tables.has(parent)) {
        dependencies.get(name)!.add(parent);
      }
    }
  }
  const ordered: string[] = [];
  const remaining = new Set(tables.keys());
  while (remaining.size) {
    const ready = [...remaining]
      .filter((name) =>
        [...dependencies.get(name)!].every((parent) => !remaining.has(parent)),
      )
      .toSorted();
    if (!ready.length) {
      throw new Error(
        `Could not order tables by foreign keys: ${[...remaining].join(", ")}`,
      );
    }
    for (const name of ready) {
      ordered.push(name);
      remaining.delete(name);
    }
  }
  return ordered;
}

function applySqliteMigrations(
  database: DatabaseSync,
  directory: string,
): void {
  const journal = JSON.parse(
    readFileSync(join(directory, "meta", "_journal.json"), "utf8"),
  ) as { dialect?: string; entries: { idx: number; tag: string }[] };
  if (journal.dialect !== "sqlite") {
    throw new Error(`Expected SQLite migrations in ${directory}.`);
  }
  database.exec(
    `CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      idx INTEGER PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      hash TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );
  for (const entry of journal.entries.toSorted((a, b) => a.idx - b.idx)) {
    const sqlText = readFileSync(join(directory, `${entry.tag}.sql`), "utf8");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sqlText);
      database
        .prepare(
          `INSERT INTO ${migrationsTable} (idx, tag, hash, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          entry.idx,
          entry.tag,
          createHash("sha256").update(sqlText).digest("hex"),
          new Date().toISOString(),
        );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function migrationEntryCount(directory: string): number {
  const journal = JSON.parse(
    readFileSync(join(directory, "meta", "_journal.json"), "utf8"),
  ) as { entries: unknown[] };
  return journal.entries.length;
}

function fixResearchEventSequence(
  database: DatabaseSync,
  table: SqliteTable | undefined,
): void {
  if (!table) return;
  const max = scalar(
    database,
    `SELECT COALESCE(max(id), 0) AS value FROM ${quoteIdentifier(table.name)}`,
  );
  if (max > 0) {
    database
      .prepare("DELETE FROM sqlite_sequence WHERE name = ?")
      .run(table.name);
    database
      .prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)")
      .run(table.name, max);
  }
}

function verifyConstraints(database: DatabaseSync): void {
  const integrity = database.prepare("PRAGMA integrity_check").get() as {
    integrity_check?: string;
  };
  if (integrity.integrity_check !== "ok") {
    throw new Error(
      `SQLite integrity check failed: ${integrity.integrity_check ?? "unknown"}`,
    );
  }
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) {
    throw new Error(
      `SQLite foreign-key check failed: ${foreignKeys.length} violation(s).`,
    );
  }
}

function sqliteSchemaStats(database: DatabaseSync): {
  tables: number;
  columns: number;
  foreignKeys: number;
} {
  const names = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> ?`,
    )
    .all(migrationsTable) as { name: string }[];
  let columns = 0;
  let foreignKeys = 0;
  for (const { name } of names) {
    columns += (
      database
        .prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
        .all() as unknown[]
    ).length;
    foreignKeys += (
      database
        .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)
        .all() as unknown[]
    ).length;
  }
  return { tables: names.length, columns, foreignKeys };
}

function copyAndVerifySnapshots(
  database: DatabaseSync,
  sourceDataDirectory: string,
  destinationDirectory: string,
): SnapshotCheck {
  const sourceDirectory = join(sourceDataDirectory, snapshotFolder);
  if (!existsSync(sourceDirectory)) {
    throw new Error(`Snapshot directory not found: ${sourceDirectory}`);
  }
  mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const rows = database
    .prepare("SELECT hash, byte_length FROM snapshots ORDER BY hash")
    .all() as { hash: string; byte_length: number }[];
  const unique = new Map<string, number>();
  for (const row of rows) unique.set(row.hash, Number(row.byte_length));
  let filesVerified = 0;
  let totalBytes = 0;
  for (const [hash, byteLength] of unique) {
    const sourceFile = join(sourceDirectory, hash);
    if (!existsSync(sourceFile)) {
      throw new Error(`Snapshot file is missing from source: ${sourceFile}`);
    }
    const sourceStat = statSync(sourceFile);
    if (sourceStat.size !== byteLength) {
      throw new Error(
        `Snapshot size mismatch for ${hash}: database ${byteLength}, file ${sourceStat.size}.`,
      );
    }
    if (fileSha256(sourceFile) !== hash) {
      throw new Error(
        `Snapshot content does not match its hash: ${sourceFile}`,
      );
    }
    const destinationFile = join(destinationDirectory, hash);
    if (
      !existsSync(destinationFile) ||
      statSync(destinationFile).size !== byteLength
    ) {
      cpSync(sourceFile, destinationFile, { preserveTimestamps: true });
    }
    if (fileSha256(destinationFile) !== hash) {
      throw new Error(
        `Copied snapshot does not match its hash: ${destinationFile}`,
      );
    }
    filesVerified++;
    totalBytes += byteLength;
  }
  return {
    referenced: rows.length,
    uniqueHashes: unique.size,
    filesVerified,
    totalBytes,
  };
}

function verifySnapshotsWithoutCopy(
  database: DatabaseSync,
  sourceDataDirectory: string,
): SnapshotCheck {
  const sourceDirectory = join(sourceDataDirectory, snapshotFolder);
  const rows = database
    .prepare("SELECT hash, byte_length FROM snapshots ORDER BY hash")
    .all() as { hash: string; byte_length: number }[];
  const unique = new Map<string, number>();
  for (const row of rows) unique.set(row.hash, Number(row.byte_length));
  let filesVerified = 0;
  let totalBytes = 0;
  for (const [hash, byteLength] of unique) {
    const file = join(sourceDirectory, hash);
    if (!existsSync(file) || statSync(file).size !== byteLength) {
      throw new Error(
        `Snapshot file is missing or has the wrong size: ${file}`,
      );
    }
    filesVerified++;
    totalBytes += byteLength;
  }
  return {
    referenced: rows.length,
    uniqueHashes: unique.size,
    filesVerified,
    totalBytes,
  };
}

function verifyCompanyLogos(
  database: DatabaseSync,
  sourceDataDirectory: string,
  destinationDirectory: string,
): string[] {
  const warnings: string[] = [];
  const rows = database
    .prepare(
      "SELECT logo_path FROM companies WHERE logo_path IS NOT NULL AND logo_path <> ''",
    )
    .all() as { logo_path: string }[];
  const sourceDirectory = join(sourceDataDirectory, logoFolder);
  for (const { logo_path } of rows) {
    const name = logo_path.split("/").pop()!;
    const sourceFile = join(sourceDirectory, name);
    if (!existsSync(sourceFile)) {
      warnings.push(`Company logo is missing from DATA_DIR: ${logo_path}`);
      continue;
    }
    const destinationFile = join(destinationDirectory, name);
    if (!existsSync(destinationFile)) {
      mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
      cpSync(sourceFile, destinationFile, { preserveTimestamps: true });
    }
  }
  return warnings;
}

function verifyStagedDatabase(
  databaseFile: string,
  report: ImportReport,
): void {
  const database = new DatabaseSync(databaseFile, { readBigInts: true });
  try {
    verifyConstraints(database);
    verifyReportedRowCounts(database, report);
    const schema = readSqliteSchema(database);
    for (const table of report.tables) {
      const targetTable = schema.get(table.name);
      if (!targetTable) {
        throw new Error(`Staged database is missing table ${table.name}.`);
      }
      const digest = digestRowHashes(readSqliteRows(database, targetTable));
      if (digest !== table.digest) {
        throw new Error(
          `Staged table ${table.name} digest changed: ${digest}, expected ${table.digest}.`,
        );
      }
    }
    verifySnapshotContents(database, join(dirname(databaseFile), "data"));
  } finally {
    database.close();
  }
}

function verifyInstalledDatabase(
  databaseFile: string,
  report: ImportReport,
): void {
  const database = new DatabaseSync(databaseFile, { readBigInts: true });
  try {
    verifyConstraints(database);
    verifyReportedRowCounts(database, report);
    const migrations = scalar(
      database,
      `SELECT CAST(count(*) AS INTEGER) AS value FROM ${migrationsTable}`,
    );
    if (migrations !== report.migrations.entries) {
      throw new Error(
        `Installed database has ${migrations} migration records, expected ${report.migrations.entries}.`,
      );
    }
  } finally {
    database.close();
  }
}

function verifyReportedRowCounts(
  database: DatabaseSync,
  report: ImportReport,
): void {
  for (const table of report.tables) {
    const count = scalar(
      database,
      `SELECT CAST(count(*) AS INTEGER) AS value FROM ${quoteIdentifier(table.name)}`,
    );
    if (count !== table.rows) {
      throw new Error(
        `Table ${table.name} has ${count} rows, expected ${table.rows}.`,
      );
    }
  }
}

function verifySnapshotFiles(
  databaseFile: string,
  dataDirectory: string,
): void {
  const database = new DatabaseSync(databaseFile, { readBigInts: true });
  try {
    verifySnapshotContents(database, dataDirectory);
  } finally {
    database.close();
  }
}

function moveIntoPlace(source: string, destination: string): void {
  try {
    renameSync(source, destination);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  // A staging directory can be on another filesystem. Copy next to the target
  // first so the final rename stays atomic.
  const temporary = join(
    dirname(destination),
    `.surface-import-${process.pid}-${Date.now()}.sqlite3`,
  );
  try {
    cpSync(source, temporary, { force: true });
    chmodSync(temporary, 0o600);
    const descriptor = openSync(temporary, "r+");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function verifySnapshotContents(
  database: DatabaseSync,
  dataDirectory: string,
): void {
  const rows = database
    .prepare("SELECT hash, byte_length FROM snapshots ORDER BY hash")
    .all() as { hash: string; byte_length: number }[];
  for (const { hash, byte_length } of rows) {
    const file = join(dataDirectory, snapshotFolder, hash);
    if (!existsSync(file)) {
      throw new Error(`Snapshot file is missing: ${file}`);
    }
    if (statSync(file).size !== Number(byte_length)) {
      throw new Error(`Snapshot file has the wrong size: ${file}`);
    }
    if (fileSha256(file) !== hash) {
      throw new Error(`Snapshot file content does not match ${hash}: ${file}`);
    }
  }
}

function assertNoProcessUsingDatabase(targetDatabase: string): void {
  const currentPid = process.pid;
  const databaseMarker = `SQLITE_DATABASE_FILE=${targetDatabase}`;
  const databaseFiles = new Set([
    targetDatabase,
    `${targetDatabase}-wal`,
    `${targetDatabase}-shm`,
  ]);
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === currentPid) continue;
    const processDirectory = join("/proc", entry);
    let environment = "";
    try {
      environment = readFileSync(join(processDirectory, "environ"), "utf8");
    } catch {
      continue;
    }
    let openFile = false;
    try {
      for (const descriptor of readdirSync(join(processDirectory, "fd"))) {
        const link = readlinkSync(join(processDirectory, "fd", descriptor));
        if (databaseFiles.has(link)) {
          openFile = true;
          break;
        }
      }
    } catch {
      // Processes can exit or change ownership while we scan.
    }
    if (environment.includes(databaseMarker) || openFile) {
      let command = "unknown command";
      try {
        command = readFileSync(join(processDirectory, "cmdline"), "utf8")
          .replaceAll("\0", " ")
          .trim();
      } catch {
        // Keep the generic message.
      }
      throw new Error(
        `The desktop app appears to be using ${targetDatabase} (pid ${pid}: ${command}). Quit Surface before installing an import.`,
      );
    }
  }
}

function assertDatabaseNotOpen(databaseFile: string): void {
  if (!existsSync(databaseFile)) return;
  const database = new DatabaseSync(databaseFile);
  try {
    database.exec("PRAGMA busy_timeout=0");
    database.exec("PRAGMA locking_mode=EXCLUSIVE");
    database.exec("BEGIN EXCLUSIVE");
    database.exec("ROLLBACK");
  } catch (error) {
    throw new Error(
      `The target database is in use. Quit Surface and try again: ${databaseFile}`,
      { cause: error },
    );
  } finally {
    database.close();
  }
}

function assertProductionDatabase(
  databaseUrl: string,
  allowAnyDatabase: boolean,
): void {
  const name = databaseName(databaseUrl);
  if (name !== "surface-data" && !allowAnyDatabase) {
    throw new Error(
      `Refusing to import from database "${name}". Set --allow-any-database only for a verified test database.`,
    );
  }
}

function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

function databaseHost(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}${url.port ? `:${url.port}` : ""}`;
}

function sqliteAffinity(
  column: SqliteColumn,
): "text" | "integer" | "real" | "blob" | "numeric" {
  const type = column.type.toUpperCase();
  if (type.includes("INT")) return "integer";
  if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) {
    return "text";
  }
  if (type.includes("BLOB") || type === "") return "blob";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) {
    return "real";
  }
  return "numeric";
}

function scalar(database: DatabaseSync, query: string): number {
  const row = database.prepare(query).get() as { value?: number | bigint };
  return Number(row?.value ?? 0);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function fileSha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fsyncDirectory(directory: string): void {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
