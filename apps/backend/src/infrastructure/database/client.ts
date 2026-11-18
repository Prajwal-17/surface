import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { sql, type SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import { env } from "../../config/env";
import * as schema from "./schema";

const sqliteDialect = new SQLiteSyncDialect();
const sqliteClient = openSqlite(env.SQLITE_DATABASE_FILE);

/**
 * Serializes SQLite work on the single embedded connection. A transaction
 * holds the queue for its whole callback; statements made from inside that
 * callback bypass the queue and stay on the same connection.
 */
const sqliteActive = new AsyncLocalStorage<boolean>();
const sqliteTransactionContext = new AsyncLocalStorage<Transaction>();
let sqliteQueue: Promise<unknown> = Promise.resolve();

function runSqliteExclusive<T>(work: () => T | Promise<T>): Promise<T> {
  if (sqliteActive.getStore()) return Promise.resolve(work());
  const result = sqliteQueue.then(() => sqliteActive.run(true, work));
  sqliteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function toSqliteParameter(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "bigint" || value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

export const db = drizzleSqliteProxy(
  async (query, parameters, method) =>
    runSqliteExclusive(() => {
      const statement = sqliteClient.prepare(query);
      const values = parameters.map(toSqliteParameter);
      if (method === "run") {
        statement.run(...values);
        return { rows: [] };
      }
      statement.setReturnArrays(true);
      if (method === "get")
        return {
          rows: (statement.get(...values) ?? []) as unknown as unknown[],
        };
      return { rows: statement.all(...values) as unknown as unknown[][] };
    }),
  { schema },
);

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** BEGIN IMMEDIATE serializes writers before a transaction reads or writes. */
export async function transaction<T>(
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const current = sqliteTransactionContext.getStore();
  if (current) return callback(current);
  return runSqliteExclusive(() =>
    db.transaction(
      (tx) => sqliteTransactionContext.run(tx, () => callback(tx)),
      { behavior: "immediate" },
    ),
  );
}

/**
 * Runs work on a caller-supplied database or transaction. When no transaction
 * is supplied this opens a SQLite transaction. A supplied transaction (for
 * example from the executor) keeps the work in its existing transaction.
 */
export async function runTransaction<T>(
  connection: Database | Transaction,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (connection !== db) {
    return callback(connection as Transaction);
  }
  return transaction(callback);
}

/** Exposes the native SQLite connection for the migration runner. */
export function sqliteHandle(): DatabaseSync {
  return sqliteClient;
}

export async function rawQuery<T = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  return (await queryRows(sql(strings, ...values))) as T;
}

export async function queryRows<T = Record<string, unknown>>(
  statement: SQL,
): Promise<T[]> {
  const prepared = sqliteDialect.sqlToQuery(statement);
  return executeStatement<T>(prepared.sql, prepared.params);
}

export async function executeStatement<T = Record<string, unknown>>(
  query: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  return runSqliteExclusive(() => {
    const statement = sqliteClient.prepare(query);
    const values = parameters.map(toSqliteParameter);
    if (
      /^\s*(select|with|pragma)\b/i.test(query) ||
      /\breturning\b/i.test(query)
    ) {
      return statement.all(...values) as T[];
    }
    statement.run(...values);
    return [];
  });
}

export async function closeDatabase(): Promise<void> {
  await runSqliteExclusive(() => sqliteClient.close());
}

export function resolveMigrationsFolder(): string {
  const folderName = "drizzle-sqlite";
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    env.SQLITE_MIGRATIONS_DIR,
    join(sourceDirectory, "../../../", folderName),
    join(sourceDirectory, "../../", folderName),
    join(dirname(process.execPath), "resources", "backend", folderName),
    join(process.execPath, "..", folderName),
    resolve(process.cwd(), "apps/backend", folderName),
    resolve(process.cwd(), folderName),
  ].filter((value): value is string => Boolean(value));
  const folder = candidates.find((candidate) =>
    existsSync(join(candidate, "meta", "_journal.json")),
  );
  if (!folder) {
    throw new Error(
      `Surface SQLite migrations were not found. Checked: ${candidates.join(", ")}. Set SQLITE_MIGRATIONS_DIR to the packaged migrations directory.`,
    );
  }
  return folder;
}

function openSqlite(file: string): DatabaseSync {
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  }
  const database = new DatabaseSync(file);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  return database;
}
