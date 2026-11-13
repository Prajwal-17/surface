import { eq } from "drizzle-orm";
import { databaseDialect, type Transaction } from "./client";
import { coordinationLocks } from "../../modules/work/work.tables";

/**
 * Adds a PostgreSQL row lock when supported. SQLite has no `FOR UPDATE`; its
 * IMMEDIATE transaction already holds the write lock on the single connection.
 */
export function withRowLock<T extends { for: (strength: "update") => unknown }>(
  query: T,
): T {
  if (databaseDialect() === "sqlite") return query;
  return query.for("update") as T;
}

/**
 * Acquires a transaction-scoped coordination lock.
 *
 * PostgreSQL uses a row lock. SQLite transactions run with BEGIN IMMEDIATE on
 * one serialized connection, so the insert itself takes the write lock and no
 * `FOR UPDATE` clause is used.
 */
export async function lockCoordination(
  tx: Transaction,
  name: string,
): Promise<void> {
  await tx.insert(coordinationLocks).values({ name }).onConflictDoNothing();
  if (databaseDialect() === "sqlite") return;
  const [lock] = await tx
    .select({ name: coordinationLocks.name })
    .from(coordinationLocks)
    .where(eq(coordinationLocks.name, name))
    .for("update");
  if (!lock) {
    throw new Error(`Could not acquire coordination lock ${name}.`);
  }
}
