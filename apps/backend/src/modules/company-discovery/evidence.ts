import { parseHTML } from "linkedom";
import { desc, eq, and, isNull } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crawlMetadataSchema, publicUrlSchema } from "@surface/contracts";
import { db } from "../../infrastructure/database/client";
import { snapshots, resources } from "../collection/collection.tables";
import { persistSnapshot, snapshotDirectory } from "../collection/snapshots";
import { fetchPublic } from "../collection/public-http";
import type { DiscoveryPage } from "./sources";
import { canonicalUrl } from "./identity";

const inFlight = new Map<string, Promise<DiscoveryPage>>();

function readStaticPage(url: string, html: string): DiscoveryPage {
  const { document } = parseHTML(html);
  const text = document.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const links = [...(document.querySelectorAll("a[href]") ?? [])]
    .flatMap((anchor) => {
      try {
        const href = new URL(anchor.getAttribute("href")!, url).href;
        if (!publicUrlSchema.safeParse(href).success) return [];
        const title = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return title ? [{ url: href, title, context: title }] : [];
      } catch {
        return [];
      }
    })
    .slice(0, 1000);
  const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  const images: Array<{
    url: string;
    kind: "logo" | "favicon";
    source: string;
  }> = [...(document.querySelectorAll("img[src]") ?? [])]
    .flatMap((image) => {
      try {
        const imageUrl = new URL(image.getAttribute("src")!, url).href;
        if (!publicUrlSchema.safeParse(imageUrl).success) return [];
        return [{ url: imageUrl, kind: "logo" as const, source: "page image" }];
      } catch {
        return [];
      }
    })
    .slice(0, 30);
  const favicon = document.querySelector('link[rel~="icon"][href]');
  if (favicon) {
    try {
      const iconUrl = new URL(favicon.getAttribute("href")!, url).href;
      if (publicUrlSchema.safeParse(iconUrl).success)
        images.push({ url: iconUrl, kind: "favicon", source: "page icon" });
    } catch {
      // Ignore invalid icon links.
    }
  }
  let directoryCompany: Record<string, unknown> | null = null;
  if (new URL(url).hostname.replace(/^www\./, "") === "ycombinator.com") {
    try {
      const pageData = JSON.parse(
        document.querySelector("[data-page]")?.getAttribute("data-page") ??
          "{}",
      ) as { props?: { company?: Record<string, unknown> } };
      const company = pageData.props?.company;
      if (company?.id && company.name) {
        directoryCompany = {
          id: company.id,
          slug: company.slug,
          name: company.name,
          website: company.website,
          batch: company.batch_name,
          description: company.one_liner,
          location: company.location,
          tags: company.tags,
        };
      }
    } catch {
      // A missing or changed directory payload does not invalidate the page.
    }
  }
  const metadata = crawlMetadataSchema.parse({
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]'),
    siteName: meta('meta[property="og:site_name"]'),
    images,
    publishedAt: meta('meta[property="article:published_time"]') || null,
    directoryCompany,
  });
  return {
    url,
    title: document.title?.trim() ?? "",
    text,
    links,
    metadata,
    status: "200",
    retrievedAt: new Date().toISOString(),
  };
}

/** Reads ordinary public HTML without launching a browser or executing page scripts. */
export async function readCompanyPage(
  input: string,
  _render = false,
  force = false,
) {
  const url = canonicalUrl(input);
  const key = `${url}:${force}`;
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
          eq(snapshots.mediaType, "application/vnd.surface.static-page+json"),
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
        const cached = JSON.parse(
          await readFile(join(snapshotDirectory, latest.snapshot.hash), "utf8"),
        ) as DiscoveryPage;
        if (cached.url === url)
          return { ...cached, snapshotId: latest.snapshot.id };
      } catch {
        // Re-fetch a missing or obsolete cache.
      }
    }
    const response = await fetchPublic(publicUrlSchema.parse(url));
    if (!response.mediaType.includes("html"))
      throw new Error("The page did not return HTML.");
    const page = readStaticPage(response.url, response.body);
    const snapshot = await persistSnapshot({
      url: response.url,
      body: JSON.stringify(page),
      mediaType: "application/vnd.surface.static-page+json",
      statusCode: response.statusCode,
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
