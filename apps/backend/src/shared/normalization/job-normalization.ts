import { createHash } from "node:crypto";
import type { DiscoverySearchInput, SourceKey } from "@repo/contracts";

export interface JobCandidate {
  source: SourceKey;
  externalId: string | null;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  employmentType: string | null;
  description: string;
  applyUrl: string;
  sourceUrl: string;
  postedAt: string | null;
  tags: string[];
}

const trackingParameters = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
]);

export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function toStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toStringValue(item))
    .filter((item): item is string => Boolean(item));
}

export function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP job links are supported.");
  }

  url.hash = "";
  for (const parameter of [...url.searchParams.keys()]) {
    if (
      trackingParameters.has(parameter.toLowerCase()) ||
      parameter.toLowerCase().startsWith("utm_")
    ) {
      url.searchParams.delete(parameter);
    }
  }

  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  return url.toString();
}

function fingerprintPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createJobFingerprint(candidate: JobCandidate): string {
  const value = [
    fingerprintPart(candidate.company),
    fingerprintPart(candidate.title),
    fingerprintPart(candidate.location),
  ].join("|");

  return createHash("sha256").update(value).digest("hex");
}

export function createSourceRecordKey(candidate: JobCandidate): string {
  const identity = candidate.externalId || canonicalizeUrl(candidate.sourceUrl);
  return createHash("sha256")
    .update(`${candidate.source}|${identity}`)
    .digest("hex");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function matchesSearch(
  candidate: JobCandidate,
  input: DiscoverySearchInput,
): boolean {
  const queryTokens = tokenize(input.query);
  const title = candidate.title.toLowerCase();
  const highSignal = [
    candidate.title,
    candidate.company,
    candidate.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const allContent = [highSignal, candidate.description].join(" ").toLowerCase();

  const highSignalMatches = queryTokens.filter((token) =>
    highSignal.includes(token),
  ).length;
  const contentMatches = queryTokens.filter((token) =>
    allContent.includes(token),
  ).length;

  const queryMatches =
    queryTokens.length === 0 ||
    highSignalMatches >= Math.max(1, Math.ceil(queryTokens.length / 2)) ||
    contentMatches === queryTokens.length ||
    title.includes(input.query.toLowerCase());

  if (!queryMatches) return false;
  if (!input.location) return true;

  const locationTokens = tokenize(input.location);
  const location = candidate.location.toLowerCase();
  return (
    locationTokens.every((token) => location.includes(token)) ||
    (candidate.isRemote &&
      ["worldwide", "global", "anywhere"].some((term) =>
        location.includes(term),
      ))
  );
}

export function normalizeCandidate(candidate: JobCandidate): JobCandidate {
  const applyUrl = canonicalizeUrl(candidate.applyUrl);
  const sourceUrl = canonicalizeUrl(candidate.sourceUrl || candidate.applyUrl);
  const location = cleanText(candidate.location) || "Location not listed";

  return {
    ...candidate,
    title: cleanText(candidate.title) || "Untitled role",
    company: cleanText(candidate.company) || "Company not listed",
    location,
    isRemote:
      candidate.isRemote ||
      /\b(remote|worldwide|anywhere)\b/i.test(location),
    employmentType: cleanText(candidate.employmentType) || null,
    description: cleanText(candidate.description),
    applyUrl,
    sourceUrl,
    tags: candidate.tags.map(cleanText).filter(Boolean),
  };
}
