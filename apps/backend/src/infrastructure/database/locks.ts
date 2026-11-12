import { eq } from "drizzle-orm";
import type { Transaction } from "./client";
import { coordinationLocks } from "../../modules/work/work.tables";

/**
 * Acquires a transaction-scoped lock shared by PostgreSQL and PGlite.
 *
 * Advisory locks are a PostgreSQL process feature and are not part of the SQL
 * surface PGlite can rely on. A row lock on coordination_locks has the same
 * mutual-exclusion guarantee for these short enqueue transactions and rolls
 * back with the surrounding transaction.
 */
export async function lockCoordination(
  tx: Transaction,
  name: string,
): Promise<void> {
  await tx.insert(coordinationLocks).values({ name }).onConflictDoNothing();
  const [lock] = await tx
    .select({ name: coordinationLocks.name })
    .from(coordinationLocks)
    .where(eq(coordinationLocks.name, name))
    .for("update");
  if (!lock) {
    throw new Error(`Could not acquire coordination lock ${name}.`);
  }
}
