import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const MAX_EXCERPT = 7000;

export type FetchedSource = {
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
};

export class SourceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceFetchError";
  }
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(value: string) {
  const address = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("::ffff:")) {
    return isPrivateIpv4(address.slice("::ffff:".length));
  }
  return (
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    address.startsWith("fe8") ||
    address.startsWith("fe9") ||
    address.startsWith("fea") ||
    address.startsWith("feb") ||
    address.startsWith("ff")
  );
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
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

  const literalVersion = isIP(hostname);
  if (literalVersion) {
    if (isPrivateAddress(hostname)) {
      throw new SourceFetchError(
        "Private network source URLs are not allowed.",
      );
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SourceFetchError(`Could not resolve ${hostname}.`);
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new SourceFetchError(
      "Source URLs must resolve to public internet addresses.",
    );
  }
  return url;
}

async function readLimitedBody(response: Response) {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BYTES) {
    throw new SourceFetchError("The source page is too large to read.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new SourceFetchError("The source page is too large to read.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const charset = response.headers
    .get("content-type")
    ?.match(/charset=["']?([^;"']+)/i)?.[1]
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
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "User-Agent":
            "Surface lead discovery (+https://github.com/surface; research assistant)",
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new SourceFetchError(
        `Could not fetch ${current.hostname}. ${
          error instanceof Error ? error.message : "The request failed."
        }`,
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SourceFetchError("The source redirected without a target.");
      }
      current = await assertPublicHttpUrl(
        new URL(location, current).toString(),
      );
      continue;
    }

    if (!response.ok) {
      throw new SourceFetchError(
        `${current.hostname} returned HTTP ${response.status}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
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

    const body = await readLimitedBody(response);
    const isHtml = /html|xml/i.test(contentType) || /<html[\s>]/i.test(body);
    if (!isHtml) {
      const excerpt = body.replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT);
      if (!excerpt) {
        throw new SourceFetchError("The source page did not contain text.");
      }
      return {
        url: current.toString(),
        title: current.hostname,
        excerpt,
        retrievedAt: new Date().toISOString(),
      };
    }

    const extracted = extractReadableText(body);
    if (extracted.excerpt.length < 120) {
      throw new SourceFetchError(
        "The source page did not contain enough readable text.",
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
