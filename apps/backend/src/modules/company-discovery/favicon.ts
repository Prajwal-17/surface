import { and, eq, isNull } from "drizzle-orm";
import { parseHTML } from "linkedom";
import { db } from "../../infrastructure/database/client";
import { fetchPublic } from "../collection/public-http";
import { companies } from "../workspace/workspace.tables";
import { cacheLogo } from "./enrichment";

type CompanyIdentity = Pick<
  typeof companies.$inferSelect,
  "id" | "website" | "logoPath"
>;

const inFlight = new Map<string, Promise<string | null>>();

export async function discoverFavicon(
  website: string,
  fetcher = fetchPublic,
  cache = cacheLogo,
) {
  const homepage = URL.parse("/", website);
  if (!homepage || !["http:", "https:"].includes(homepage.protocol))
    return null;
  const signal = AbortSignal.timeout(10000);
  let origin = homepage;
  const candidates = new Set<string>();
  try {
    const page = await fetcher(
      homepage.href,
      AbortSignal.any([signal, AbortSignal.timeout(4500)]),
    );
    origin = new URL(page.url);
    const { document } = parseHTML(page.body);
    for (const link of document.querySelectorAll("link[rel][href]")) {
      if (
        !/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(
          link.getAttribute("rel") ?? "",
        )
      )
        continue;
      const url = URL.parse(link.getAttribute("href")!, origin);
      if (url && ["http:", "https:"].includes(url.protocol))
        candidates.add(url.href);
      if (candidates.size >= 4) break;
    }
  } catch {
    // Some websites still serve an icon when their homepage cannot be fetched.
  }
  candidates.add(new URL("/favicon.ico", origin).href);
  for (const url of candidates) {
    try {
      const path = await cache(url, (input) =>
        fetcher(input, AbortSignal.any([signal, AbortSignal.timeout(2500)])),
      );
      return { path, url };
    } catch {
      if (signal.aborted) break;
    }
  }
  return null;
}

export async function companyFavicon(company: CompanyIdentity) {
  if (company.logoPath || !company.website) return company.logoPath;
  const key = `${company.id}:${company.website}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const lookup = (async () => {
    const favicon = await discoverFavicon(company.website);
    if (!favicon) return null;
    const [updated] = await db
      .update(companies)
      .set({
        logoPath: favicon.path,
        logoSourceUrl: favicon.url,
        logoKind: "favicon",
        logoFetchedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(companies.id, company.id),
          eq(companies.website, company.website),
          isNull(companies.logoPath),
        ),
      )
      .returning({ logoPath: companies.logoPath });
    if (updated) return updated.logoPath;
    const [current] = await db
      .select({ logoPath: companies.logoPath })
      .from(companies)
      .where(
        and(
          eq(companies.id, company.id),
          eq(companies.website, company.website),
        ),
      );
    return current?.logoPath ?? null;
  })();
  inFlight.set(key, lookup);
  try {
    return await lookup;
  } finally {
    inFlight.delete(key);
  }
}
