import { z } from "zod";
import { tool } from "ai";
import { HttpError } from "../../shared/errors/http-error";
import { getRuntimeSettings } from "../../config/runtime";
import { publicUrlSchema, crawlMetadataSchema } from "@surface/contracts";
export const searchInput = z
  .object({
    query: z.string().trim().min(1).max(1000),
    page: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export const crawlInput = z
  .object({ url: publicUrlSchema, render: z.boolean().optional() })
  .strict();
const linkSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  context: z.string().optional(),
});
export const crawlOutput = z.object({
  url: z.string().url(),
  title: z.string(),
  text: z.string().max(500000),
  links: z.array(linkSchema).max(1000),
  metadata: crawlMetadataSchema,
  snapshotId: z.string().optional(),
  status: z.string(),
  retrievedAt: z.string(),
});

export type WebToolExecutors = {
  search: (input: z.infer<typeof searchInput>) => Promise<unknown>;
  crawl: (input: z.infer<typeof crawlInput>) => Promise<unknown>;
};

/** Typed SDK tools around the existing SearXNG and crawler executors. */
export function webTools(executors: WebToolExecutors) {
  return {
    search_web: tool({
      description:
        "Search public web pages using our SearXNG instance. Search snippets are leads, not verified page evidence.",
      inputSchema: searchInput,
      execute: async (input) => await executors.search(input),
    }),
    crawl_page: tool({
      description:
        "Read a public page with Crawlee, extracting text and links. JavaScript rendering is automatic when needed; set render=true if the static content is incomplete. Do not attempt private sites or authenticated access.",
      inputSchema: crawlInput,
      execute: async (input) => await executors.crawl(input),
    }),
  };
}
export async function searchWeb(
  input: z.infer<typeof searchInput>,
  signal?: AbortSignal,
) {
  const settings = getRuntimeSettings();
  const url = new URL(
    "search",
    `${settings.searxngBaseUrl.replace(/\/?$/, "")}/`,
  );
  url.search = new URLSearchParams({
    q: input.query,
    format: "json",
    language: "en",
    pageno: String(input.page ?? 1),
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.any([
      AbortSignal.timeout(25000),
      ...(signal ? [signal] : []),
    ]),
  }).catch(() => {
    signal?.throwIfAborted();
    throw new HttpError(
      502,
      "Cannot reach SearXNG. Start the search service and check SEARXNG_BASE_URL.",
    );
  });
  if (!response.ok)
    throw new HttpError(
      502,
      `SearXNG returned HTTP ${response.status}. Check the service and that JSON search is enabled.`,
    );
  const body = z
    .object({
      unresponsive_engines: z.array(z.array(z.string())).default([]),
      results: z.array(
        z.object({
          url: z.string(),
          title: z.string().default(""),
          content: z.string().default(""),
        }),
      ),
    })
    .parse(await response.json());
  if (!body.results.length && body.unresponsive_engines.length)
    throw new HttpError(
      502,
      `SearXNG returned no results; unavailable engines: ${body.unresponsive_engines.map((e) => e.join(": ")).join("; ")}`,
    );
  const seen = new Set<string>();
  return body.results
    .filter((r) => {
      if (!publicUrlSchema.safeParse(r.url).success || seen.has(r.url))
        return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, 12);
}
export async function crawlPage(
  input: z.infer<typeof crawlInput>,
  signal: AbortSignal,
) {
  if (!getRuntimeSettings().crawlerEnabled) {
    throw new Error(
      "Browser research is unavailable in this session. Start Surface with browser research enabled to collect new pages.",
    );
  }
  const id = crypto.randomUUID();
  const crawlerBaseUrl = getRuntimeSettings().crawlerBaseUrl;
  const cancel = () => {
    void fetch(`${crawlerBaseUrl}/crawl/${id}/cancel`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  };
  signal.throwIfAborted();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(`${crawlerBaseUrl}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, id }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        body.error || `Crawlee returned HTTP ${response.status}.`,
      );
    }
    return crawlOutput.parse(await response.json());
  } catch (error) {
    cancel();
    signal.throwIfAborted();
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach Crawlee. Start the crawler service and check CRAWLER_BASE_URL.",
        { cause: error },
      );
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
