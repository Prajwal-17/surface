import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip, createGzip } from "node:zlib";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";

export const EXPORT_FORMAT = "surface-desktop-data-export";
export const EXPORT_FORMAT_VERSION = 1;

export interface ColumnInfo {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  ordinal: number;
}

export interface TableManifest {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
  rowsSha256: string;
  sampleSha256: string | null;
  file: string;
  fileSha256: string;
  bytes: number;
}

export interface AssetManifest {
  snapshots: AssetDirectory;
  companyLogos: AssetDirectory;
  authSecret: { sha256: string; bytes: number } | null;
}

export interface AssetDirectory {
  count: number;
  bytes: number;
}

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  createdAt: string;
  source: {
    driver: "postgres" | "pglite";
    serverVersion: string;
    dataDir: string | null;
  };
  tables: TableManifest[];
  assetDirectory: string;
  assets: AssetManifest;
  schemaFingerprint: string;
  migrationTags: string[];
}

export interface TableRows {
  [column: string]: unknown;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return value.toString();
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    return { __surfaceType: "bytes", base64: value.toString("base64") };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).toSorted()) {
    result[key] = canonicalize(record[key]);
  }
  return result;
}

export function rowHash(row: TableRows): string {
  return sha256(canonicalJson(row));
}

/**
 * Normalizes driver-specific scalar types before hashing or writing JSONL.
 * postgres-js returns bigint/int8 as strings; PGlite returns numbers. Both
 * representations must hash identically for import verification.
 */
export function normalizeRow(
  row: TableRows,
  columns: ColumnInfo[],
): TableRows {
  const result: TableRows = {};
  for (const column of columns) {
    const value = row[column.name];
    if (value === null || value === undefined) {
      result[column.name] = null;
    } else if (
      column.dataType === "bigint" ||
      column.dataType === "numeric"
    ) {
      result[column.name] = String(value);
    } else if (
      column.dataType === "integer" ||
      column.dataType === "smallint"
    ) {
      result[column.name] = Number(value);
    } else if (column.dataType === "boolean") {
      result[column.name] = Boolean(value);
    } else {
      result[column.name] = value;
    }
  }
  return result;
}

export function rowsDigest(hashes: readonly string[]): string {
  return sha256(hashes.toSorted().join("\n"));
}

export function schemaFingerprint(tables: TableManifest[]): string {
  return sha256(
    tables
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((table) =>
        [
          table.name,
          ...table.columns
            .toSorted((a, b) => a.ordinal - b.ordinal)
            .map(
              (column) =>
                `${column.ordinal}:${column.name}:${column.dataType}:${column.udtName}:${column.nullable}`,
            ),
        ].join("\n"),
      )
      .join("\n---\n"),
  );
}

export async function writeTableFile(
  path: string,
  rows: Iterable<TableRows> | AsyncIterable<TableRows>,
): Promise<{
  rowCount: number;
  rowsSha256: string;
  sampleSha256: string | null;
  bytes: number;
}> {
  const output = createWriteStream(path, { mode: 0o600 });
  const gzip = createGzip({ level: 9 });
  gzip.pipe(output);
  const hashes: string[] = [];
  let bytes = 0;
  try {
    for await (const row of rows) {
      const normalized = canonicalize(row) as TableRows;
      hashes.push(rowHash(normalized));
      const line = `${canonicalJson(normalized)}\n`;
      bytes += Buffer.byteLength(line);
      if (!gzip.write(line)) await once(gzip, "drain");
    }
    gzip.end();
    await once(output, "close");
  } catch (error) {
    gzip.destroy();
    output.destroy();
    throw error;
  }
  return {
    rowCount: hashes.length,
    rowsSha256: rowsDigest(hashes),
    sampleSha256: hashes.toSorted()[0] ?? null,
    bytes,
  };
}

export async function* readTableFile(
  path: string,
): AsyncGenerator<TableRows> {
  const input = createReadStream(path);
  const gunzip = createGunzip();
  input.pipe(gunzip);
  let pending = Buffer.alloc(0);
  try {
    for await (const chunk of gunzip) {
      pending = Buffer.concat([pending, chunk as Buffer]);
      let newline = pending.indexOf(0x0a);
      while (newline >= 0) {
        const line = pending.subarray(0, newline).toString("utf8");
        pending = pending.subarray(newline + 1);
        if (line.trim()) yield JSON.parse(line) as TableRows;
        newline = pending.indexOf(0x0a);
      }
    }
    if (pending.length) {
      const line = pending.toString("utf8");
      if (line.trim()) yield JSON.parse(line) as TableRows;
    }
  } finally {
    input.destroy();
    gunzip.destroy();
  }
}

export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  const input = createReadStream(path);
  await pipeline(input, async (source) => {
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
    }
  });
  return hash.digest("hex");
}

export function qualified(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name.replaceAll('"', '""')}"`;
}
