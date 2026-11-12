import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../../config/env";
import * as schema from "./schema";

type Database = PgliteDatabase<typeof schema>;

const dialect = new PgDialect();
const pgClient = env.EMBEDDED_DATABASE
  ? undefined
  : postgres(env.DATABASE_URL!, { max: 10 });

const pgliteClient = env.EMBEDDED_DATABASE
  ? new PGlite(env.PGLITE_DATA_DIR!)
  : undefined;

/**
 * PGlite exposes the same query builder surface Surface uses from
 * postgres-js. The concrete driver type is erased here so route modules do not
 * need two implementations.
 */
export const db = (pgliteClient
  ? drizzlePglite(pgliteClient, { schema })
  : drizzlePostgres({ client: pgClient!, schema })) as unknown as Database;

export type { Database };
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Runs a small tagged SQL statement on either driver. Route code uses this for
 * catalog/information_schema reads that are not worth a Drizzle table.
 */
export async function pg<T = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const statement = sql(strings, ...values);
  if (pgliteClient) {
    const prepared = dialect.sqlToQuery(statement);
    const result = await pgliteClient.query(prepared.sql, prepared.params);
    return result.rows as T;
  }
  const result = await (
    pgClient as unknown as (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown[]>
  )(strings, ...values);
  return [...result] as T;
}

export async function pgQuery<T = Record<string, unknown>>(
  statement: SQL,
): Promise<T[]> {
  const prepared = dialect.sqlToQuery(statement);
  return executeStatement<T>(prepared.sql, prepared.params);
}

export async function executeStatement<T = Record<string, unknown>>(
  query: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  if (pgliteClient) {
    const result = await pgliteClient.query(query, parameters);
    return result.rows as T[];
  }
  const result = await (
    pgClient as unknown as {
      unsafe(query: string, parameters: unknown[]): Promise<unknown[]>;
    }
  ).unsafe(query, parameters);
  return [...result] as T[];
}

export async function closeDatabase(): Promise<void> {
  if (pgliteClient) {
    await pgliteClient.close();
    return;
  }
  if (pgClient) {
    await pgClient.end({ timeout: 5 });
  }
}

export function resolveMigrationsFolder(): string {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    env.MIGRATIONS_DIR,
    join(sourceDirectory, "../../../drizzle"),
    join(sourceDirectory, "../../drizzle"),
    join(dirname(process.execPath), "resources", "backend", "drizzle"),
    join(process.execPath, "..", "drizzle"),
    resolve(process.cwd(), "apps/backend/drizzle"),
    resolve(process.cwd(), "drizzle"),
  ].filter((value): value is string => Boolean(value));
  const folder = candidates.find((candidate) =>
    existsSync(join(candidate, "meta", "_journal.json")),
  );
  if (!folder) {
    throw new Error(
      `Surface database migrations were not found. Checked: ${candidates.join(", ")}. Set MIGRATIONS_DIR to the packaged drizzle directory.`,
    );
  }
  return folder;
}
