import { desc, eq, and, isNull } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../../infrastructure/database/client";
import { snapshots, resources } from "../collection/collection.tables";
import { persistSnapshot, snapshotDirectory } from "../collection/snapshots";
import { crawlPage, crawlOutput } from "../research/tools";
import type { DiscoveryPage } from "./sources";
import { canonicalUrl } from "./identity";
const inFlight = new Map<string, Promise<DiscoveryPage>>();
export async function readCompanyPage(
  input: string,
  render = false,
  force = false,
) {
  const url = canonicalUrl(input),
    key = `${url}:${render}:${force}`;
  const active = inFlight.get(key);
  if (active) return active;
  const promise = (async () => {
    const [latest] = await db
      .select({ snapshot: snapshots })
      .from(resources)
      .innerJoin(snapshots, eq(snapshots.resourceId, resources.id))
      .where(
        and(
          eq(resources.url, url),
          eq(snapshots.mediaType, "application/vnd.surface.crawl+json"),
          isNull(snapshots.removedAt),
        ),
      )
      .orderBy(desc(snapshots.fetchedAt))
      .limit(1);
    if (
      !force &&
      latest &&
      Date.now() - Date.parse(latest.snapshot.fetchedAt) < 6 * 3600000
    ) {
      try {
        const cached = crawlOutput.parse(
          JSON.parse(
            await readFile(
              join(snapshotDirectory, latest.snapshot.hash),
              "utf8",
            ),
          ),
        );
        if (!render || cached.text.length > 1000)
          return { ...cached, snapshotId: latest.snapshot.id };
      } catch {
        /* Re-fetch a missing or obsolete cache. */
      }
    }
    const page = await crawlPage({ url, render }, AbortSignal.timeout(95000));
    const snapshot = await persistSnapshot({
      url,
      body: JSON.stringify(page),
      mediaType: "application/vnd.surface.crawl+json",
      statusCode: 200,
    });
    return { ...page, snapshotId: snapshot.snapshotId };
  })();
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}
