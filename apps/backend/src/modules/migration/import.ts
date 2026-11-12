import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { env } from "../../config/env";
import {
  executeStatement,
  resolveMigrationsFolder,
} from "../../infrastructure/database/client";
import { runMigrations } from "../../infrastructure/database/migrate";
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ColumnInfo,
  type ExportManifest,
  type TableManifest,
  type TableRows,
  canonicalize,
  hashFile,
  normalizeRow,
  qualified,
  readTableFile,
  rowHash,
  rowsDigest,
} from "./format";

export interface ImportOptions {
  input: string;
  dataDir: string;
  /** Final user-data path recorded in the import manifest. */
  destination?: string;
}

export interface ImportReport {
  format: string;
  importedAt: string;
  sourceExport: string;
  destination: string;
  migrationsFolder: string;
  tables: Record<string, number>;
  totalRows: number;
  snapshotFiles: number;
  companyLogoSymbols: number;
  checks: Record<string, string>;
}

const BATCH_ROWS = 400;

export async function importSurfaceData(
  options: ImportOptions,
): Promise<ImportReport> {
  if (!env.EMBEDDED_DATABASE) {
    throw new Error(
      "Data import targets the embedded PGlite database. Set PGLITE_DATA_DIR and rerun the import.",
    );
  }
  const manifest = readManifest(options.input);
  const tablesDir = join(options.input, "tables");
  const assetsDir = join(options.input, "assets");

  for (const table of manifest.tables) {
    const path = join(options.input, table.file);
    if (!existsSync(path)) {
      throw new Error(`Export is incomplete: ${table.file} is missing.`);
    }
    const actual = await hashFile(path);
    if (actual !== table.fileSha256) {
      throw new Error(
        `Export file ${table.file} is corrupt (expected ${table.fileSha256}, found ${actual}).`,
      );
    }
  }

  await runMigrations();
  await verifyDestinationSchema(manifest);

  const importedCounts: Record<string, number> = {};
  for (const table of manifest.tables) {
    const rows = readTableFile(join(tablesDir, `${table.name}.jsonl.gz`));
    await insertTable(table, rows);
    importedCounts[table.name] = table.rowCount;
  }
  await resetSequences();

  const checks: Record<string, string> = {};
  for (const table of manifest.tables) {
    await verifyTable(table);
    checks[`table:${table.name}`] = `${table.rowCount} rows match`;
  }
  checks["settings:analysis_settings"] = await verifySettings(manifest);
  const assets = await copyAndVerifyAssets(
    options.dataDir,
    assetsDir,
    manifest,
  );
  await verifyAssetLinks(options.dataDir);
  checks["snapshots:links"] = assets.snapshotCheck;
  checks["snapshots:files"] = `${assets.snapshotFiles} verified`;
  checks["company-logos:links"] = assets.logoCheck;

  const report: ImportReport = {
    format: `${manifest.format} v${manifest.formatVersion}`,
    importedAt: new Date().toISOString(),
    sourceExport: options.input,
    destination: options.destination ?? options.dataDir,
    migrationsFolder: resolveMigrationsFolder(),
    tables: importedCounts,
    totalRows: Object.values(importedCounts).reduce((a, b) => a + b, 0),
    snapshotFiles: assets.snapshotFiles,
    companyLogoSymbols: manifest.assets.companyLogos.count,
    checks,
  };
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(options.dataDir, "import-manifest.json"),
    `${JSON.stringify({ ...report, sourceManifest: manifest }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return report;
}

export async function verifyImportedData(
  input: string,
  dataDir: string,
): Promise<ImportReport> {
  if (!env.EMBEDDED_DATABASE) {
    throw new Error("Verification requires PGLITE_DATA_DIR.");
  }
  const manifest = readManifest(input);
  const checks: Record<string, string> = {};
  await verifyDestinationSchema(manifest);
  for (const table of manifest.tables) {
    await verifyTable(table);
    checks[`table:${table.name}`] = `${table.rowCount} rows match`;
  }
  checks["settings:analysis_settings"] = await verifySettings(manifest);
  const assets = await copyAndVerifyAssets(
    dataDir,
    join(input, "assets"),
    manifest,
    false,
  );
  await verifyAssetLinks(dataDir);
  checks["snapshots:links"] = assets.snapshotCheck;
  checks["snapshots:files"] = `${assets.snapshotFiles} verified`;
  checks["company-logos:links"] = assets.logoCheck;
  return {
    format: `${manifest.format} v${manifest.formatVersion}`,
    importedAt: new Date().toISOString(),
    sourceExport: input,
    destination: dataDir,
    migrationsFolder: resolveMigrationsFolder(),
    tables: Object.fromEntries(
      manifest.tables.map((table) => [table.name, table.rowCount]),
    ),
    totalRows: manifest.tables.reduce((sum, table) => sum + table.rowCount, 0),
    snapshotFiles: assets.snapshotFiles,
    companyLogoSymbols: manifest.assets.companyLogos.count,
    checks,
  };
}

function readManifest(input: string): ExportManifest {
  const path = join(input, "manifest.json");
  if (!existsSync(path)) {
    throw new Error(
      `No export manifest at ${path}. Pass the directory produced by the export command; pg_dump files are not supported directly.`,
    );
  }
  const manifest = JSON.parse(readFileSync(path, "utf8")) as ExportManifest;
  if (manifest.format !== EXPORT_FORMAT) {
    throw new Error(
      `Unsupported export format ${String(manifest.format)}. Expected ${EXPORT_FORMAT}.`,
    );
  }
  if (manifest.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(
      `Unsupported export version ${String(manifest.formatVersion)}. This build supports version ${EXPORT_FORMAT_VERSION}.`,
    );
  }
  if (!Array.isArray(manifest.tables) || !manifest.tables.length) {
    throw new Error("The export manifest contains no tables.");
  }
  return manifest;
}

async function verifyDestinationSchema(
  manifest: ExportManifest,
): Promise<void> {
  const rows = await executeStatement<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    ordinal_position: number;
  }>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, ordinal_position
     FROM information_schema.columns WHERE table_schema='public'`,
  );
  const columns = new Map<string, ColumnInfo[]>();
  for (const row of rows) {
    const list = columns.get(row.table_name) ?? [];
    list.push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === "YES",
      ordinal: row.ordinal_position,
    });
    columns.set(row.table_name, list);
  }
  const problems: string[] = [];
  for (const table of manifest.tables) {
    const destination = columns.get(table.name);
    if (!destination) {
      problems.push(`missing table ${table.name}`);
      continue;
    }
    const byName = new Map(destination.map((column) => [column.name, column]));
    for (const column of table.columns) {
      const target = byName.get(column.name);
      if (!target) {
        problems.push(`missing column ${table.name}.${column.name}`);
      } else if (
        target.dataType !== column.dataType ||
        target.udtName !== column.udtName
      ) {
        problems.push(
          `type mismatch ${table.name}.${column.name}: export ${column.dataType}/${column.udtName}, app ${target.dataType}/${target.udtName}`,
        );
      }
    }
  }
  if (problems.length) {
    throw new Error(
      `The export does not match this Surface schema: ${problems.slice(0, 20).join("; ")}${problems.length > 20 ? ` (${problems.length} total)` : ""}`,
    );
  }
}

async function insertTable(
  table: TableManifest,
  rows: AsyncIterable<TableRows>,
): Promise<void> {
  const columns = table.columns.toSorted((a, b) => a.ordinal - b.ordinal);
  if (!columns.length) return;
  let batch: TableRows[] = [];
  await executeStatement("BEGIN");
  try {
    for await (const row of rows) {
      batch.push(row);
      if (batch.length >= BATCH_ROWS) {
        await insertBatch(table.name, columns, batch);
        batch = [];
      }
    }
    if (batch.length) await insertBatch(table.name, columns, batch);
    await executeStatement("COMMIT");
  } catch (error) {
    await executeStatement("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function insertBatch(
  table: string,
  columns: ColumnInfo[],
  rows: TableRows[],
): Promise<void> {
  const parameters: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      parameters.push(encodeValue(column, row[column.name]));
      return `$${parameters.length}${castFor(column)}`;
    });
    return `(${placeholders.join(",")})`;
  });
  await executeStatement(
    `INSERT INTO ${qualified(table)} (${columns.map((column) => qualified(column.name)).join(",")}) VALUES ${tuples.join(",")}`,
    parameters,
  );
}

function encodeValue(column: ColumnInfo, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (column.dataType === "json" || column.dataType === "jsonb") {
    return JSON.stringify(value);
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "__surfaceType" in value &&
    (value as { __surfaceType?: string }).__surfaceType === "bytes"
  ) {
    return Buffer.from(
      String((value as { base64?: string }).base64 ?? ""),
      "base64",
    );
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function castFor(column: ColumnInfo): string {
  switch (column.dataType) {
    case "json":
    case "jsonb":
      return `::${column.dataType}`;
    case "bigint":
    case "integer":
    case "smallint":
    case "boolean":
    case "numeric":
    case "double precision":
    case "real":
      return `::${column.dataType}`;
    default:
      return "";
  }
}

async function resetSequences(): Promise<void> {
  const sequences = await executeStatement<{
    table_name: string;
    column_name: string;
    sequence_name: string | null;
  }>(
    `SELECT table_name, column_name, pg_get_serial_sequence(quote_ident(table_schema) || '.' || quote_ident(table_name), column_name) AS sequence_name
     FROM information_schema.columns
     WHERE table_schema='public' AND column_default LIKE 'nextval(%'`,
  );
  for (const row of sequences) {
    if (!row.sequence_name) continue;
    await executeStatement(
      `SELECT setval($1, COALESCE((SELECT MAX(${qualified(row.column_name)}) FROM ${qualified(row.table_name)}), 0) + 1, false)`,
      [row.sequence_name],
    );
  }
}

async function verifyTable(table: TableManifest): Promise<void> {
  const columns = table.columns
    .toSorted((a, b) => a.ordinal - b.ordinal)
    .map((column) => qualified(column.name))
    .join(",");
  const rows = await executeStatement<TableRows>(
    `SELECT ${columns} FROM ${qualified(table.name)}`,
  );
  const hashes = rows.map((row) =>
    rowHash(canonicalize(normalizeRow(row, table.columns)) as TableRows),
  );
  if (rows.length !== table.rowCount) {
    throw new Error(
      `Row count mismatch for ${table.name}: export ${table.rowCount}, imported ${rows.length}.`,
    );
  }
  const digest = rowsDigest(hashes);
  if (digest !== table.rowsSha256) {
    throw new Error(
      `Content mismatch for ${table.name}: export ${table.rowsSha256}, imported ${digest}.`,
    );
  }
  const sample = hashes.toSorted()[0] ?? null;
  if (sample !== table.sampleSha256) {
    throw new Error(
      `Representative record mismatch for ${table.name}.`,
    );
  }
}

async function verifySettings(manifest: ExportManifest): Promise<string> {
  const table = manifest.tables.find(
    (candidate) => candidate.name === "analysis_settings",
  );
  if (!table) return "not present in export";
  const rows = await executeStatement<TableRows>(
    `SELECT * FROM ${qualified("analysis_settings")}`,
  );
  if (rows.length !== table.rowCount) {
    throw new Error(
      `Settings row count mismatch: export ${table.rowCount}, imported ${rows.length}.`,
    );
  }
  return `${rows.length} analysis settings row(s) verified`;
}

async function copyAndVerifyAssets(
  dataDir: string,
  assetsDir: string,
  manifest: ExportManifest,
  copy = true,
): Promise<{
  snapshotFiles: number;
  snapshotCheck: string;
  logoCheck: string;
}> {
  if (!existsSync(assetsDir)) {
    throw new Error(`Export assets directory is missing: ${assetsDir}.`);
  }
  const snapshotTarget = join(dataDir, "snapshots");
  const logoTarget = join(dataDir, "company-logos");
  const snapshotSource = join(assetsDir, "snapshots");
  const logoSource = join(assetsDir, "company-logos");
  if (copy) {
    mkdirSync(snapshotTarget, { recursive: true, mode: 0o700 });
    mkdirSync(logoTarget, { recursive: true, mode: 0o700 });
    if (existsSync(snapshotSource))
      cpSync(snapshotSource, snapshotTarget, {
        recursive: true,
        dereference: true,
      });
    if (existsSync(logoSource))
      cpSync(logoSource, logoTarget, {
        recursive: true,
        dereference: true,
      });
  }
  const snapshotStats = directoryStats(snapshotTarget);
  if (snapshotStats.count !== manifest.assets.snapshots.count) {
    throw new Error(
      `Snapshot file count mismatch: export ${manifest.assets.snapshots.count}, destination ${snapshotStats.count}.`,
    );
  }
  const logoStats = directoryStats(logoTarget);
  if (logoStats.count !== manifest.assets.companyLogos.count) {
    throw new Error(
      `Company logo file count mismatch: export ${manifest.assets.companyLogos.count}, destination ${logoStats.count}.`,
    );
  }
  if (manifest.assets.authSecret) {
    const source = join(assetsDir, ".surface-auth-secret");
    const target = join(dataDir, ".surface-auth-secret");
    if (copy) copyFileSync(source, target);
    const actual = statSync(target).size;
    if (actual !== manifest.assets.authSecret.bytes) {
      throw new Error("Session signing key size mismatch.");
    }
    if ((await hashFile(target)) !== manifest.assets.authSecret.sha256) {
      throw new Error("Session signing key checksum mismatch.");
    }
  }
  return {
    snapshotFiles: snapshotStats.count,
    snapshotCheck: "entity files present",
    logoCheck: `${logoStats.count} symbol file(s) present`,
  };
}

function directoryStats(directory: string) {
  if (!existsSync(directory)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    count++;
    bytes += statSync(join(directory, entry.name)).size;
  }
  return { count, bytes };
}

/** Verifies that every imported snapshot row has a hash-addressed file. */
export async function verifyAssetLinks(dataDir: string): Promise<void> {
  const snapshots = await executeStatement<{ hash: string }>(
    `SELECT hash FROM snapshots WHERE removed_at IS NULL`,
  );
  for (const row of snapshots) {
    const path = join(dataDir, "snapshots", row.hash);
    if (!existsSync(path)) {
      throw new Error(`Snapshot ${row.hash} is referenced but its file is missing.`);
    }
    const digest = await hashFile(path);
    if (digest !== row.hash) {
      throw new Error(`Snapshot ${row.hash} does not match its stored hash.`);
    }
  }
  const orphanObservations = await executeStatement<{ count: number }>(
    `SELECT count(*)::integer AS count FROM observations o
     LEFT JOIN snapshots s ON s.id=o.snapshot_id
     WHERE o.snapshot_id IS NOT NULL AND s.id IS NULL`,
  );
  if ((orphanObservations[0]?.count ?? 0) > 0) {
    throw new Error("Observations reference missing snapshot rows.");
  }
  const logos = await executeStatement<{ logo_path: string | null }>(
    `SELECT logo_path FROM companies WHERE logo_path IS NOT NULL`,
  );
  for (const row of logos) {
    const file = row.logo_path?.split("/").at(-1);
    if (file && !existsSync(join(dataDir, "company-logos", file))) {
      throw new Error(`Company logo ${file} is referenced but missing.`);
    }
  }
}
