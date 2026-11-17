import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import postgres from "postgres";
import { env } from "../../config/env";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

const isSqlite = env.DATABASE_DIALECT === "sqlite";
const pgDialect = new PgDialect();
const sqliteDialect = new SQLiteSyncDialect();

const pgClient = isSqlite
  ? undefined
  : postgres(env.DATABASE_URL!, { max: 10 });

const sqliteClient = isSqlite
  ? openSqlite(env.SQLITE_DATABASE_FILE!)
  : undefined;

/**
 * Serializes SQLite work on the single embedded connection. A transaction
 * holds the queue for its whole callback; statements made from inside that
 * callback bypass the queue and stay on the same connection.
 */
const sqliteActive = new AsyncLocalStorage<boolean>();
const sqliteTransactionContext = new AsyncLocalStorage<boolean>();
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

function sqliteRows<T>(
  query: string,
  parameters: readonly unknown[] = [],
  method: "all" | "get" | "run" = "all",
): T {
  if (!sqliteClient) throw new Error("SQLite is not configured.");
  const statement = sqliteClient.prepare(query);
  const values = parameters.map(toSqliteParameter);
  if (method === "run") {
    statement.run(...values);
    return [] as T;
  }
  if (method === "get") {
    return statement.get(...values) as T;
  }
  return statement.all(...values) as T;
}

const sqliteDatabase = sqliteClient
  ? drizzleSqliteProxy(async (query, parameters, method) =>
      runSqliteExclusive(() => {
        if (method === "run") {
          sqliteRows(query, parameters, "run");
          return { rows: [] };
        }
        const statement = sqliteClient.prepare(query);
        statement.setReturnArrays(true);
        const values = parameters.map(toSqliteParameter);
        if (method === "get") {
          const row = statement.get(...values) as unknown;
          return { rows: (row ?? []) as unknown[] };
        }
        return { rows: statement.all(...values) as unknown as unknown[][] };
      }),
    )
  : undefined;

/**
 * The public database handle. SQLite and PostgreSQL expose the same query
 * builder surface for the statements Surface uses; the concrete driver type is
 * erased so route modules do not need two implementations.
 */
export const db = (sqliteDatabase ??
  drizzlePostgres({ client: pgClient!, schema })) as unknown as Database;

export type { Database };
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Runs a transaction on either driver. SQLite transactions begin IMMEDIATE so
 * writers are serialized before the callback reads or writes, and all work on
 * the embedded connection is queued behind the transaction.
 */
export async function transaction<T>(
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!sqliteDatabase) {
    return db.transaction(callback);
  }
  if (sqliteTransactionContext.getStore()) {
    return callback(db as unknown as Transaction);
  }
  return runSqliteExclusive(() =>
    sqliteTransactionContext.run(true, () =>
      (
        sqliteDatabase as unknown as {
          transaction: (
            fn: (tx: Transaction) => Promise<T>,
            config: { behavior: "immediate" },
          ) => Promise<T>;
        }
      ).transaction(callback, { behavior: "immediate" }),
    ),
  );
}

/**
 * Runs work on a caller-supplied database or transaction. When no transaction
 * is supplied this opens one with the dialect-appropriate semantics; when a
 * transaction is supplied (for example from the executor) the work joins it.
 */
export async function runTransaction<T>(
  connection: Database | Transaction,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if ((connection as unknown) !== (db as unknown)) {
    return callback(connection as unknown as Transaction);
  }
  return transaction(callback);
}

export function databaseDialect(): "sqlite" | "postgres" {
  return isSqlite ? "sqlite" : "postgres";
}

/** The embedded SQLite handle, used by the migration runner and diagnostics. */
export function sqliteHandle(): DatabaseSync | undefined {
  return sqliteClient;
}

/**
 * Runs a small tagged SQL statement on either driver. Route code uses this for
 * health checks and dialect-specific catalog reads.
 */
export async function rawQuery<T = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const statement = sql(strings, ...values);
  if (isSqlite) {
    const prepared = sqliteDialect.sqlToQuery(statement);
    return (await executeStatement(prepared.sql, prepared.params)) as T;
  }
  const prepared = pgDialect.sqlToQuery(statement);
  return (await executeStatement(prepared.sql, prepared.params)) as T;
}

/** @deprecated Use rawQuery. Kept for PostgreSQL test modules. */
export const pg = rawQuery;

export async function queryRows<T = Record<string, unknown>>(
  statement: SQL,
): Promise<T[]> {
  const prepared = isSqlite
    ? sqliteDialect.sqlToQuery(statement)
    : pgDialect.sqlToQuery(statement);
  return executeStatement<T>(prepared.sql, prepared.params);
}

export async function executeStatement<T = Record<string, unknown>>(
  query: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  if (isSqlite) {
    const trimmed = query.trimStart().toLowerCase();
    if (
      /^(select|with|pragma)\b/.test(trimmed) ||
      /\breturning\b/.test(trimmed)
    ) {
      return sqliteRows<T[]>(query, parameters, "all");
    }
    return sqliteRows<T[]>(query, parameters, "run");
  }
  const result = await (
    pgClient as unknown as {
      unsafe(query: string, parameters: unknown[]): Promise<unknown[]>;
    }
  ).unsafe(query, [...parameters]);
  return [...result] as T[];
}

export async function closeDatabase(): Promise<void> {
  if (sqliteClient) {
    sqliteClient.close();
    return;
  }
  if (pgClient) {
    await pgClient.end({ timeout: 5 });
  }
}

export function resolveMigrationsFolder(): string {
  return isSqlite
    ? resolveMigrationsFolderNamed("drizzle-sqlite", env.SQLITE_MIGRATIONS_DIR)
    : resolveMigrationsFolderNamed("drizzle", env.MIGRATIONS_DIR);
}

function resolveMigrationsFolderNamed(
  folderName: string,
  configured: string | undefined,
): string {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    configured,
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
      `Surface ${isSqlite ? "SQLite" : "PostgreSQL"} migrations were not found. Checked: ${candidates.join(", ")}. Set ${isSqlite ? "SQLITE_MIGRATIONS_DIR" : "MIGRATIONS_DIR"} to the packaged migrations directory.`,
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
