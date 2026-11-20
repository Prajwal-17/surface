import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isPrivateAddress, validatedLookup } from "./ssrf";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const MAX_EXCERPT = 7000;
const FETCH_TIMEOUT_MS = 15_000;

export type FetchedSource = {
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
};

export class SourceFetchError extends Error {
  /**
   * Whether retrying through the rendered-browser engine could plausibly
   * succeed (thin HTML, bot blocks, fetch-level errors). Policy and URL
   * rejections are not retryable.
   */
  readonly retryWithRender: boolean;

  constructor(message: string, retryWithRender = false) {
    super(message);
    this.name = "SourceFetchError";
    this.retryWithRender = retryWithRender;
  }
}

/** Rejects non-HTTP(S), credentialed, local, and private-network destinations. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceFetchError("Use a valid HTTP or HTTPS source URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SourceFetchError("Only HTTP and HTTPS sources can be fetched.");
  }
  if (url.username || url.password) {
    throw new SourceFetchError("Source URLs cannot include credentials.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan")
  ) {
    throw new SourceFetchError("Local source URLs are not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new SourceFetchError(
        "Private network source URLs are not allowed.",
      );
    }
    return url;
  }

  const addresses = await validatedLookup(hostname);
  if (!addresses) {
    throw new SourceFetchError(
      `Could not resolve ${hostname}, or it resolved to a private network address.`,
    );
  }
  return url;
}

type SimpleResponse = {
  status: number;
  contentType: string;
  location: string | null;
  body: string;
};

/**
 * HTTP(S) GET with DNS pinning: the host is resolved once, checked against
 * private ranges, and the connection only ever uses the approved addresses.
 * Each redirect hop re-validates, so no hop can bypass the guard.
 */
async function pinnedFetch(
  url: URL,
  signal: AbortSignal,
): Promise<SimpleResponse> {
  const lookup = await validatedLookup(url.hostname);
  if (!lookup) {
    throw new SourceFetchError(
      "Source URLs must resolve to public internet addresses.",
    );
  }
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  const options: RequestOptions = {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      "User-Agent":
        "Surface lead discovery (+https://github.com/surface; research assistant)",
    },
    lookup,
    signal,
  };

  return await new Promise<SimpleResponse>((resolve, reject) => {
    const request = transport(url, options, (response) => {
      const status = response.statusCode ?? 0;
      const contentType = String(response.headers["content-type"] ?? "");
      const locationHeader = response.headers["location"];
      const location =
        typeof locationHeader === "string" ? locationHeader : null;
      const chunks: Buffer[] = [];
      let total = 0;
      let tooLarge = false;
      response.on("data", (chunk: Buffer) => {
        if (tooLarge) return;
        total += chunk.length;
        if (total > MAX_BYTES) {
          tooLarge = true;
          response.destroy(
            new SourceFetchError("The source page is too large to read."),
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on("error", (error) => reject(error));
      response.on("end", () => {
        if (tooLarge) return; // already rejected via destroy
        resolve({
          status,
          contentType,
          location,
          body: decodeBody(Buffer.concat(chunks), contentType),
        });
      });
    });
    request.on("error", (error) => reject(error));
    request.end();
  });
}

function decodeBody(bytes: Buffer, contentType: string) {
  const charset = contentType
    .match(/charset=["']?([^;"']+)/i)?.[1]
    ?.trim()
    ?.toLowerCase();
  try {
    return new TextDecoder(
      charset && charset !== "utf-8" ? charset : "utf-8",
    ).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const numeric =
        code[1]?.toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : match;
    }
    return entities[code.toLowerCase()] ?? match;
  });
}

export function extractReadableText(html: string) {
  const title = decodeEntities(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const description = decodeEntities(
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    )?.[1] ??
      html.match(
        /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
      )?.[1] ??
      "",
  ).trim();

  const withoutHead = html
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(
      /<(script|style|noscript|svg|iframe|template|canvas)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(withoutHead)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const excerpt = [
    title ? `Title: ${title}` : "",
    description ? `Description: ${description}` : "",
    text,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_EXCERPT);
  return { title, excerpt };
}

export async function fetchSourcePage(rawUrl: string): Promise<FetchedSource> {
  let current = await assertPublicHttpUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    let response: SimpleResponse;
    try {
      response = await pinnedFetch(
        current,
        AbortSignal.timeout(FETCH_TIMEOUT_MS),
      );
    } catch (error) {
      if (error instanceof SourceFetchError) throw error;
      throw new SourceFetchError(
        `Could not fetch ${current.hostname}. ${
          error instanceof Error ? error.message : "The request failed."
        }`,
        true,
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location) {
        throw new SourceFetchError("The source redirected without a target.");
      }
      current = await assertPublicHttpUrl(
        new URL(response.location, current).toString(),
      );
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new SourceFetchError(
        `${current.hostname} returned HTTP ${response.status}.`,
        response.status === 403 || response.status === 503,
      );
    }

    const contentType = response.contentType;
    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml|text\/plain|application\/json/i.test(
        contentType,
      )
    ) {
      throw new SourceFetchError(
        `${current.hostname} returned ${contentType.split(";")[0]}, which is not a readable page.`,
      );
    }

    const isHtml =
      /html|xml/i.test(contentType) || /<html[\s>]/i.test(response.body);
    if (!isHtml) {
      const excerpt = response.body
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_EXCERPT);
      if (!excerpt) {
        throw new SourceFetchError(
          "The source page did not contain text.",
          true,
        );
      }
      return {
        url: current.toString(),
        title: current.hostname,
        excerpt,
        retrievedAt: new Date().toISOString(),
      };
    }

    const extracted = extractReadableText(response.body);
    if (extracted.excerpt.length < 120) {
      throw new SourceFetchError(
        "The source page did not contain enough readable text.",
        true,
      );
    }
    return {
      url: current.toString(),
      title: extracted.title || current.hostname,
      excerpt: extracted.excerpt,
      retrievedAt: new Date().toISOString(),
    };
  }
  throw new SourceFetchError("The source redirected too many times.");
}
