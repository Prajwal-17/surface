import { ycProfileUrls } from "./yc";
import { XMLParser } from "fast-xml-parser";
import {
  type CompanySearchInput,
  type CompanyEvidence,
} from "@surface/contracts";
import { crawlOutput, searchWeb } from "../web-tools";
import type { z } from "zod";
import { evidenceDate, normalizedName, websiteIdentity } from "../identity";
export type DiscoveryPage = z.infer<typeof crawlOutput>;
export interface CompanyCandidate {
  name: string;
  website: string;
  description: string;
  kind: "funding" | "yc" | "manual";
  provider: string;
  providerId: string | null;
  batch: string | null;
  amount: string | null;
  currency: string | null;
  stage: string | null;
  announcementDate: string | null;
  publicationDate: string | null;
  evidence: CompanyEvidence[];
  page: DiscoveryPage;
}
export const fundingHosts = {
  techcrunch: "techcrunch.com",
  venturebeat: "venturebeat.com",
  businesswire: "businesswire.com",
  prnewswire: "prnewswire.com",
} as const;
export function pageEvidence(page: DiscoveryPage): CompanyEvidence {
  return {
    url: page.url,
    title: page.title,
    excerpt: page.text.slice(0, 4000),
    retrievedAt: page.retrievedAt,
    ...(page.snapshotId ? { snapshotId: page.snapshotId } : {}),
  };
}
export function fundingFacts(text: string) {
  const match =
    /(?:raised?|raises?|secured?|securing|closed?|closes?|lands?|bags?|gets?|funding\s+(?:of|round\s+of))\s+(?:a\s+)?(?:new\s+)?(?:[\w-]+\s+round\s+(?:of\s+)?)?((?:US\$|\$|€|£|USD\s*|EUR\s*|GBP\s*|INR\s*|₹)\s*[\d,.]+\s*(?:billion|million|crore|[MBK]\b)?)/i.exec(
      text,
    );
  const amountMatch = match?.[1]?.match(
    /([\d,.]+)\s*(billion|million|crore|[MBK])?/i,
  );
  const multiplier =
    (
      {
        billion: 1e9,
        million: 1e6,
        crore: 1e7,
        b: 1e9,
        m: 1e6,
        k: 1e3,
      } as Record<string, number>
    )[amountMatch?.[2]?.toLowerCase() ?? ""] ?? 1;
  const amount = amountMatch
    ? String(Number(amountMatch[1]!.replaceAll(",", "")) * multiplier)
    : null;
  const currency = match?.[1]
    ? /€|EUR/i.test(match[1])
      ? "EUR"
      : /£|GBP/i.test(match[1])
        ? "GBP"
        : /₹|INR/i.test(match[1])
          ? "INR"
          : "USD"
    : null;
  const stageMatch = /\b(pre[ -]?seed|seed|series\s+[a-h]|growth)\b/i.exec(
    text,
  );
  const stage =
    stageMatch?.[1]
      ?.toLowerCase()
      .replace(/\s+/g, "-")
      .replace("preseed", "pre-seed") ?? null;
  return { amount, currency, stage };
}
export function parseCompanyPage(
  page: DiscoveryPage,
  mode: "funding" | "yc" | "manual" = "manual",
): CompanyCandidate | null {
  const evidence = [pageEvidence(page)],
    m = page.metadata;
  const base = {
    providerId: null,
    batch: null,
    amount: null,
    currency: null,
    stage: null,
    announcementDate: null,
    publicationDate: evidenceDate(m.publishedAt),
    description: m.description,
    evidence,
    page,
  };
  const yc = m.directoryCompany;
  if (
    yc &&
    typeof yc.website === "string" &&
    websiteIdentity(yc.website) &&
    typeof yc.name === "string"
  )
    return {
      ...base,
      kind: "yc",
      provider: "yc",
      providerId: String(yc.id),
      name: yc.name,
      website: yc.website,
      batch: typeof yc.batch === "string" ? yc.batch : null,
    };
  if (mode === "yc") return null;
  const title = page.title
    .replace(
      /\s*[|–—]\s*(?:TechCrunch|VentureBeat|Business Wire|PR Newswire).*$/i,
      "",
    )
    .trim();
  const facts = fundingFacts(`${title}\n${page.text.slice(0, 12000)}`);
  const fundingTitle =
    /\b(?:raises?|raised|secures?|secured|lands?|bags?|closes?|gets?|hits?)\b/i.test(
      title,
    );
  if (
    mode === "funding" ||
    (facts.amount && (fundingTitle || !websiteIdentity(page.url)))
  ) {
    const nameMatch =
      /^(?:[\w-]+\s+(?:startup|company)\s+)?(.{2,100}?)\s+(?:raises?|raised|secures?|secured|lands?|bags?|closes?|gets?|hits?)\b/i.exec(
        title,
      );
    const name = nameMatch?.[1]?.replace(/^.{1,40}?\s+startup\s+/i, "").trim();
    if (
      !name ||
      !facts.amount ||
      /in talks|seeking funding|plans to raise/i.test(title)
    )
      return null;
    // A page's external link must explicitly name the company. Publisher logos are irrelevant.
    const companyLink = page.links.find(
      (l) =>
        normalizedName(l.title) === normalizedName(name) &&
        websiteIdentity(l.url) &&
        new URL(l.url).hostname !== new URL(page.url).hostname,
    );

    const announced =
      /\bannounced\s+(?:on\s+)?(\w+\s+\d{1,2},?\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i.exec(
        page.text,
      )?.[1];
    return {
      ...base,
      ...facts,
      name,
      website: companyLink ? new URL(companyLink.url).origin : "",
      kind: "funding",
      providerId: page.url,
      provider: new URL(page.url).hostname.replace(/^www\./, ""),
      announcementDate: evidenceDate(announced),
    };
  }
  const identity = websiteIdentity(page.url);
  if (!identity) return null;
  return {
    ...base,
    kind: "manual",
    provider: "website",
    name: m.siteName || title.split(/[|–—]/)[0]!.trim() || identity,
    website: new URL(page.url).origin,
  };
}
export function matchesRule(
  c: CompanyCandidate,
  rule: CompanySearchInput,
  now = new Date(),
) {
  if (rule.source === "yc" && (!c.batch || !rule.batches.includes(c.batch)))
    return false;
  if (rule.source === "funding") {
    if (c.kind !== "funding") return false;
    if (
      rule.stages.length &&
      (!c.stage ||
        !rule.stages.includes(c.stage as (typeof rule.stages)[number]))
    )
      return false;
    // Search engine time filters are leads only. Unknown dates cannot satisfy recency.
    const date = c.announcementDate ?? c.publicationDate;
    if (
      !date ||
      Date.parse(date) < now.getTime() - rule.recencyDays * 86400000 ||
      Date.parse(date) > now.getTime() + 86400000
    )
      return false;
  }
  const text =
    `${c.name} ${c.description} ${c.page.text.slice(0, 30000)}`.toLowerCase();
  if (
    rule.keywords.length &&
    !rule.keywords.some((k) => text.includes(k.toLowerCase()))
  )
    return false;
  if (
    rule.geography.length &&
    !rule.geography.some((k) => text.includes(k.toLowerCase()))
  )
    return false;
  return true;
}
export async function discoverUrls(
  rule: CompanySearchInput,
  _fetchPage: (url: string, render?: boolean) => Promise<DiscoveryPage>,
  fetchFeed: (url: string) => Promise<string>,
  search = searchWeb,
) {
  const urls = new Set<string>(),
    errors: string[] = [];
  if (rule.source === "yc") {
    try {
      const directory = await ycProfileUrls(rule, fetchFeed);
      for (const url of directory.urls) urls.add(url);
      errors.push(...directory.errors);
    } catch (e) {
      errors.push(`YC directory: ${String(e)}`);
    }
    for (const batch of urls.size ? [] : rule.batches) {
      try {
        for (let page = 1; page <= 2; page++) {
          const found = await search({
            query: `site:ycombinator.com/companies/ "${batch}" ${rule.keywords.join(" ")}`,
            page,
          });
          for (const r of found)
            if (
              /^https:\/\/(?:www\.)?ycombinator\.com\/companies\/[^/?#]+\/?$/.test(
                r.url,
              )
            )
              urls.add(r.url);
          if (found.length < 12) break;
        }
      } catch (e) {
        errors.push(String(e));
      }
    }
  } else {
    for (const source of rule.fundingSources) {
      try {
        for (let page = 1; page <= 2; page++) {
          const found = await search({
            query: `site:${fundingHosts[source]} ${rule.keywords.join(" ")} raises funding ${rule.stages.join(" ")}`,
            page,
          });
          for (const r of found)
            if (
              new URL(r.url).hostname.replace(/^www\./, "") ===
              fundingHosts[source]
            )
              urls.add(r.url);
          if (found.length < 12) break;
        }
      } catch (e) {
        errors.push(String(e));
      }
      if (source === "techcrunch")
        try {
          const raw = await fetchFeed("https://techcrunch.com/feed/");
          const feed = new XMLParser().parse(raw),
            items = feed.rss?.channel?.item;
          if (!items)
            throw new Error("TechCrunch feed did not return RSS items.");
          for (const item of (Array.isArray(items) ? items : [items]).slice(
            0,
            40,
          ))
            if (
              /rais|funding|seed|secures|lands|gets|valuation/i.test(
                item.title ?? "",
              ) &&
              typeof item.link === "string"
            )
              urls.add(item.link);
        } catch (e) {
          errors.push(String(e));
        }
    }
  }
  if (!urls.size)
    errors.push(
      "No usable source URLs returned. Check SearXNG engine availability or add a company/profile URL manually.",
    );
  if (urls.size > 60)
    errors.push(
      "Discovery capped at 60 pages; narrow this search for complete coverage.",
    );
  return { urls: [...urls].slice(0, 60), errors };
}
