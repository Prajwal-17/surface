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
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type AssetManifest,
  type ColumnInfo,
  type ExportManifest,
  type TableManifest,
  type TableRows,
  hashFile,
  normalizeRow,
  qualified,
  schemaFingerprint,
  writeTableFile,
} from "./format";

export interface ExportOptions {
  output: string;
  dataDir?: string;
  allowMissingAssets?: boolean;
}

export async function exportSurfaceData(
  options: ExportOptions,
): Promise<ExportManifest> {
  const output = options.output;
  if (existsSync(output) && readdirSync(output).length) {
    throw new Error(
      `Export destination ${output} is not empty. Choose a new directory so existing backups are never overwritten.`,
    );
  }
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const tablesDir = join(output, "tables");
  const assetsDir = join(output, "assets");
  mkdirSync(tablesDir, { recursive: true, mode: 0o700 });
  mkdirSync(assetsDir, { recursive: true, mode: 0o700 });

  const sourceDataDir = options.dataDir ?? env.DATA_DIR;
  const tableNames = (
    await executeStatement<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE'
         AND table_name <> '__drizzle_migrations'
       ORDER BY table_name`,
    )
  ).map((row) => row.table_name);
  if (!tableNames.length) {
    throw new Error("The source database has no Surface tables.");
  }

  const columnRows = await executeStatement<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    ordinal_position: number;
  }>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, ordinal_position
     FROM information_schema.columns WHERE table_schema='public'
     ORDER BY table_name, ordinal_position`,
  );
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const row of columnRows) {
    const list = columnsByTable.get(row.table_name) ?? [];
    list.push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === "YES",
      ordinal: row.ordinal_position,
    });
    columnsByTable.set(row.table_name, list);
  }

  const order = await foreignKeyOrder(tableNames);
  const tables: TableManifest[] = [];
  for (const name of order) {
    const tableColumns = columnsByTable.get(name) ?? [];
    const rows = (
      await executeStatement<TableRows>(`SELECT * FROM ${qualified(name)}`)
    ).map((row) => normalizeRow(row, tableColumns));
    const file = `${name}.jsonl.gz`;
    const path = join(tablesDir, file);
    const result = await writeTableFile(path, rows);
    if (result.rowCount !== rows.length) {
      throw new Error(
        `Row count changed while exporting ${name}; stop writers and retry.`,
      );
    }
    tables.push({
      name,
      columns: tableColumns,
      rowCount: result.rowCount,
      rowsSha256: result.rowsSha256,
      sampleSha256: result.sampleSha256,
      file: `tables/${file}`,
      fileSha256: await hashFile(path),
      bytes: statSync(path).size,
    });
    console.info(`exported ${name}: ${result.rowCount} rows`);
  }

  const assets = await copyAssets(
    sourceDataDir,
    assetsDir,
    options.allowMissingAssets ?? false,
    (columnsByTable.get("companies") ?? []).some(
      (column) => column.name === "logo_path",
    ),
  );
  const serverVersion = (
    await executeStatement<{ version: string }>("SELECT version() AS version")
  )[0]?.version;
  const journal = JSON.parse(
    readFileSync(
      join(resolveMigrationsFolder(), "meta", "_journal.json"),
      "utf8",
    ),
  ) as { entries?: { tag: string }[] };

  const manifest: ExportManifest = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    source: {
      driver: env.EMBEDDED_DATABASE ? "pglite" : "postgres",
      serverVersion: serverVersion ?? "unknown",
      dataDir: sourceDataDir,
    },
    tables,
    assetDirectory: "assets",
    assets,
    schemaFingerprint: schemaFingerprint(tables),
    migrationTags: (journal.entries ?? []).map((entry) => entry.tag),
  };
  writeFileSync(
    join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

async function foreignKeyOrder(tableNames: string[]): Promise<string[]> {
  const edges = await executeStatement<{ child: string; parent: string }>(
    `SELECT child.relname AS child, parent.relname AS parent
     FROM pg_constraint con
     JOIN pg_class child ON child.oid = con.conrelid
     JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
     JOIN pg_class parent ON parent.oid = con.confrelid
     JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
     WHERE con.contype='f' AND child_ns.nspname='public' AND parent_ns.nspname='public'
       AND child.relname <> parent.relname`,
  );
  const known = new Set(tableNames);
  const remaining = new Set(tableNames);
  const parents = new Map<string, Set<string>>();
  for (const name of tableNames) parents.set(name, new Set());
  for (const edge of edges) {
    if (!known.has(edge.child) || !known.has(edge.parent)) continue;
    parents.get(edge.child)!.add(edge.parent);
  }
  const order: string[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((name) =>
        [...parents.get(name)!].every(
          (parent) => !remaining.has(parent) || order.includes(parent),
        ),
      )
      .toSorted();
    if (!ready.length) {
      // Cycles are not present in the Surface schema. Retain a deterministic
      // order rather than failing an otherwise valid export.
      order.push(...[...remaining].toSorted());
      break;
    }
    for (const name of ready) {
      remaining.delete(name);
      order.push(name);
    }
  }
  return order;
}

async function copyAssets(
  sourceDataDir: string,
  assetsDir: string,
  allowMissing: boolean,
  hasCompanyLogoColumn: boolean,
): Promise<AssetManifest> {
  const snapshotsSource = join(sourceDataDir, "snapshots");
  const logosSource = join(sourceDataDir, "company-logos");
  const snapshotsTarget = join(assetsDir, "snapshots");
  const logosTarget = join(assetsDir, "company-logos");
  mkdirSync(snapshotsTarget, { recursive: true, mode: 0o700 });
  mkdirSync(logosTarget, { recursive: true, mode: 0o700 });
  if (existsSync(snapshotsSource))
    cpSync(snapshotsSource, snapshotsTarget, {
      recursive: true,
      dereference: true,
    });
  if (existsSync(logosSource))
    cpSync(logosSource, logosTarget, { recursive: true, dereference: true });

  const missing: string[] = [];
  const snapshotRows = await executeStatement<{
    hash: string;
    removed_at: string | null;
  }>(`SELECT hash, removed_at FROM snapshots WHERE removed_at IS NULL`);
  for (const row of snapshotRows) {
    const file = join(snapshotsTarget, row.hash);
    if (!existsSync(file)) {
      missing.push(`snapshot ${row.hash}`);
    } else if ((await hashFile(file)) !== row.hash) {
      throw new Error(
        `Snapshot ${row.hash} does not match its content hash; export aborted.`,
      );
    }
  }
  if (hasCompanyLogoColumn) {
    const logoRows = await executeStatement<{ logo_path: string | null }>(
      `SELECT logo_path FROM companies WHERE logo_path IS NOT NULL`,
    );
    for (const row of logoRows) {
      const file = row.logo_path?.split("/").at(-1);
      if (!file) continue;
      const path = join(logosTarget, file);
      if (!existsSync(path)) missing.push(`company logo ${file}`);
    }
  }
  if (missing.length && !allowMissing) {
    throw new Error(
      `The source data directory is missing referenced evidence: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` (${missing.length} total)` : ""}. Restore the files or rerun with --allow-missing-assets.`,
    );
  }

  const secretSource = join(sourceDataDir, ".surface-auth-secret");
  let authSecret: AssetManifest["authSecret"] = null;
  if (existsSync(secretSource)) {
    const target = join(assetsDir, ".surface-auth-secret");
    copyFileSync(secretSource, target);
    authSecret = {
      sha256: await hashFile(target),
      bytes: statSync(target).size,
    };
  }
  return {
    snapshots: directoryStats(snapshotsTarget),
    companyLogos: directoryStats(logosTarget),
    authSecret,
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
