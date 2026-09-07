import { rmSync } from "node:fs";
import { join } from "node:path";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { snapshots } from "./collection.tables";
import { snapshotDirectory } from "./snapshots";
export function cleanupSnapshots(remove = false) {
  const rows = db
    .select()
    .from(snapshots)
    .orderBy(desc(snapshots.fetchedAt))
    .all();
  const latest = new Map<string, string>();
  for (const row of rows)
    if (!latest.has(row.resourceId)) latest.set(row.resourceId, row.hash);
  const retained = new Set(latest.values());
  const superseded = rows.filter(
    (row) => !row.removedAt && !retained.has(row.hash),
  );
  const hashes = [...new Set(superseded.map((row) => row.hash))];
  if (remove)
    for (const hash of hashes) {
      rmSync(join(snapshotDirectory, hash), { force: true });
      db.update(snapshots)
        .set({ removedAt: new Date().toISOString() })
        .where(eq(snapshots.hash, hash))
        .run();
    }
  return {
    files: hashes.length,
    observations: superseded.length,
    removed: remove,
  };
}
