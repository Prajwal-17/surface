import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { transaction } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { resources, snapshots } from "./collection.tables";
import type { FetchedPayload } from "./public-http";
export const snapshotDirectory = join(env.DATA_DIR, "snapshots");
export async function persistSnapshot(payload: FetchedPayload): Promise<{
  resourceId: string;
  snapshotId: string;
}> {
  const now = new Date().toISOString();
  const raw = payload.rawBytes ?? Buffer.from(payload.body);
  const hash = createHash("sha256").update(raw).digest("hex");
  mkdirSync(snapshotDirectory, { recursive: true });
  writeFileSync(join(snapshotDirectory, hash), raw, {
    flag: "w",
    mode: 0o600,
  });
  return await transaction(async (tx) => {
    await tx
      .insert(resources)
      .values({ id: crypto.randomUUID(), url: payload.url, createdAt: now })
      .onConflictDoNothing();
    const resource = (
      await tx
        .select()
        .from(resources)
        .where(eq(resources.url, payload.url))
        .limit(1)
    )[0]!;
    const snapshot = {
      id: crypto.randomUUID(),
      resourceId: resource.id,
      hash,
      mediaType: payload.mediaType,
      statusCode: payload.statusCode,
      byteLength: raw.byteLength,
      fetchedAt: now,
    };
    await tx.insert(snapshots).values(snapshot);
    return { resourceId: resource.id, snapshotId: snapshot.id };
  });
}
