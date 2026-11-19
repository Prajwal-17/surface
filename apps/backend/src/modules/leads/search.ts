import { getLeadSettings } from "./leads.repository";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  engine: string;
  publishedAt?: string;
};

export type SearchInput = {
  query: string;
  category?: string;
  timeRange?: "day" | "week" | "month" | "year" | "";
  limit?: number;
  /** Only used by the settings connection check. Agent tools use saved settings. */
  instanceUrl?: string;
};

const MAX_RESULTS = 10;

export class SearchProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}

function baseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SearchProviderError("The SearXNG URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new SearchProviderError(
      "Do not put credentials in the SearXNG URL. Use a local or self-hosted instance instead.",
    );
  }
  url.pathname = url.pathname.replace(/\/?$/, "/");
  url.search = "";
  url.hash = "";
  return url;
}

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function searchSearxng(
  input: SearchInput,
): Promise<SearchResult[]> {
  const settings = await getLeadSettings();
  const instanceUrl = input.instanceUrl?.trim() || settings.searxngUrl;
  if (!instanceUrl) {
    throw new SearchProviderError(
      "SearXNG is not configured. Add a SearXNG instance URL in Find leads settings.",
    );
  }
  const endpoint = baseUrl(instanceUrl);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/search`;
  endpoint.searchParams.set("q", input.query.slice(0, 500));
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("safesearch", "0");
  endpoint.searchParams.set("pageno", "1");
  if (input.category?.trim()) {
    endpoint.searchParams.set("categories", input.category.trim().slice(0, 60));
  }
  if (input.timeRange) {
    endpoint.searchParams.set("time_range", input.timeRange);
  }
  const limit = Math.min(Math.max(input.limit ?? 5, 1), MAX_RESULTS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Surface lead discovery (+https://github.com/surface)",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new SearchProviderError(
      `Could not reach SearXNG at ${endpoint.origin}. ${
        error instanceof Error ? error.message : "The request failed."
      }`,
    );
  }

  if (!response.ok) {
    throw new SearchProviderError(
      `SearXNG returned HTTP ${response.status}. Check the instance URL and availability.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new SearchProviderError(
      "SearXNG did not return JSON. Enable the JSON format on the instance (search.formats must include json).",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SearchProviderError("SearXNG returned malformed JSON.");
  }
  const rawResults =
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { results?: unknown }).results)
      ? (body as { results: unknown[] }).results
      : [];

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const raw of rawResults) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = safeHttpUrl(item.url);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title: title.slice(0, 300),
      url,
      snippet:
        typeof item.content === "string"
          ? item.content.trim().slice(0, 2000)
          : "",
      engine:
        typeof item.engine === "string" ? item.engine.trim().slice(0, 80) : "",
      publishedAt:
        typeof item.publishedDate === "string"
          ? item.publishedDate.slice(0, 80)
          : typeof item.published_at === "string"
            ? item.published_at.slice(0, 80)
            : undefined,
    });
    if (results.length >= limit) break;
  }
  return results;
}

export async function checkSearxngConnection(instanceUrl?: string) {
  try {
    const results = await searchSearxng({
      query: "site:example.com example",
      limit: 1,
      instanceUrl,
    });
    return { ok: true, resultCount: results.length, error: null };
  } catch (error) {
    return {
      ok: false,
      resultCount: 0,
      error:
        error instanceof Error ? error.message : "Could not reach SearXNG.",
    };
  }
}
