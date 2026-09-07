import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { resources, snapshots } from "./collection.tables";
import type { FetchedPayload } from "./public-http";
export const snapshotDirectory = join(
  dirname(resolve(env.DB_FILE_NAME)),
  "snapshots",
);
export function persistSnapshot(payload: FetchedPayload): {
  resourceId: string;
  snapshotId: string;
} {
  const now = new Date().toISOString();
  const raw = payload.rawBytes ?? Buffer.from(payload.body);
  const hash = createHash("sha256").update(raw).digest("hex");
  mkdirSync(snapshotDirectory, { recursive: true });
  writeFileSync(join(snapshotDirectory, hash), raw, {
    flag: "w",
    mode: 0o600,
  });
  return db.transaction((tx) => {
    tx.insert(resources)
      .values({ id: crypto.randomUUID(), url: payload.url, createdAt: now })
      .onConflictDoNothing()
      .run();
    const resource = tx
      .select()
      .from(resources)
      .where(eq(resources.url, payload.url))
      .get()!;
    const snapshot = {
      id: crypto.randomUUID(),
      resourceId: resource.id,
      hash,
      mediaType: payload.mediaType,
      statusCode: payload.statusCode,
      byteLength: raw.byteLength,
      fetchedAt: now,
    };
    tx.insert(snapshots).values(snapshot).run();
    return { resourceId: resource.id, snapshotId: snapshot.id };
  });
}
