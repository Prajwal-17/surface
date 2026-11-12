import { z } from "zod";
import type { CompanySearchInput } from "@surface/contracts";
import { fetchPublic } from "../../collection/public-http";
// The directory publishes short-lived, search-only credentials for its public index.
// Read them from the official page; never hard-code a key or use a private index.
export const ycDirectoryResponseSchema = z.object({
  results: z.array(
    z.object({
      hits: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) })),
      nbPages: z.number().int().nonnegative(),
      page: z.number().int().nonnegative(),
    }),
  ),
});
export async function ycProfileUrls(
  rule: CompanySearchInput,
  read: (url: string) => Promise<string>,
  request = fetchPublic,
) {
  const html = await read("https://www.ycombinator.com/companies");
  const raw = /window\.AlgoliaOpts\s*=\s*({[^;]+});/.exec(html)?.[1];
  if (!raw)
    throw new Error("YC public directory search configuration was not found.");
  const opts = z
    .object({
      app: z.string().regex(/^[A-Z0-9]{4,30}$/i),
      key: z.string().min(10).max(10000),
    })
    .parse(JSON.parse(raw));
  const urls: string[] = [],
    errors: string[] = [];
  for (let page = 0; page < 3; page++) {
    const p = await request(
      `https://${opts.app.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`,
      undefined,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Algolia-Application-Id": opts.app,
          "X-Algolia-API-Key": opts.key,
        },
        body: JSON.stringify({
          requests: [
            {
              indexName: "YCCompany_By_Launch_Date_production",
              params: new URLSearchParams({
                query: "",
                page: String(page),
                hitsPerPage: "20",
                facetFilters: JSON.stringify([
                  rule.batches.map((b) => `batch:${b}`),
                ]),
                attributesToRetrieve: JSON.stringify([
                  "id",
                  "slug",
                  "name",
                  "batch",
                ]),
                attributesToHighlight: "[]",
                analytics: "false",
              }).toString(),
            },
          ],
        }),
      },
    );
    const result = ycDirectoryResponseSchema.parse(JSON.parse(p.body))
      .results[0];
    if (!result) throw new Error("YC directory returned no result set.");
    for (const hit of result.hits)
      urls.push(`https://www.ycombinator.com/companies/${hit.slug}`);
    if (page + 1 >= result.nbPages) break;
    if (page === 2)
      errors.push(
        "YC pagination capped at 60 profiles; narrow the selected batches for complete coverage.",
      );
  }
  return { urls, errors };
}
