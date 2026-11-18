import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  companyLinkCategorySchema,
  companyLinksSchema,
  publicUrlSchema,
  type CompanyLinkCategory,
} from "@surface/contracts";
import { db, transaction } from "../../infrastructure/database/client";
import { aiConfigured, getAiSettings } from "../../config/runtime";
import { withModelSlot } from "../../shared/ai/capacity";
import { generateObject } from "../../shared/ai/generation";
import { HttpError } from "../../shared/errors/http-error";
import { getCompany } from "./repository";
import { readCompanyPage } from "./evidence";
import { saveContact } from "./contacts";
import { canonicalUrl } from "./identity";
import { companyLinks } from "./tables";

const MAX_LINKS = 8;
const MAX_PAGES = 4;
const MAX_CANDIDATES = 40;
const MAX_EMAILS = 5;

const CATEGORY_ORDER: CompanyLinkCategory[] = [
  "careers",
  "github",
  "docs",
  "linkedin",
  "x",
  "blog",
  "pricing",
  "status",
  "community",
  "website",
  "other",
];

const CATEGORY_LABEL: Record<CompanyLinkCategory, string> = {
  website: "Website",
  docs: "Docs",
  github: "GitHub",
  linkedin: "LinkedIn",
  x: "X",
  careers: "Careers",
  blog: "Blog",
  pricing: "Pricing",
  status: "Status",
  community: "Community",
  other: "Link",
};

const CTA_TEXT =
  /^(?:get started(?: free)?|start (?:for )?free|learn more|read more|view all|see (?:pricing|plans|more|all)|sign ?up|log ?in|contact (?:sales|us)|book a demo|request a demo|try (?:it )?free|explore|discover|more)$/i;

const EXTERNAL_HOSTS: Record<string, CompanyLinkCategory> = {
  "github.com": "github",
  "www.github.com": "github",
  "linkedin.com": "linkedin",
  "www.linkedin.com": "linkedin",
  "x.com": "x",
  "www.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "discord.gg": "community",
  "discord.com": "community",
  "youtube.com": "community",
  "www.youtube.com": "community",
  "reddit.com": "community",
  "www.reddit.com": "community",
};

const NOISE_HOSTS =
  /(?:^|\.)(?:sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|example\.com|domain\.com|email\.com|godaddy\.com|wix\.com|wordpress\.com|shopify\.com|cloudflare\.com|jquery\.com)$/i;

const NOISE_EMAIL =
  /^(?:noreply|no-reply|donotreply|do-not-reply|abuse|privacy|legal|dmca|unsubscribe)@/i;

interface Candidate {
  url: string;
  title: string;
  context: string;
  category: CompanyLinkCategory;
}

function inCategoryOrder(a: CompanyLinkCategory, b: CompanyLinkCategory) {
  return CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b);
}

export function categorizeLink(url: string, website: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "other" as const;
  }
  const host = parsed.hostname.toLowerCase();
  const external = EXTERNAL_HOSTS[host];
  if (external) return external;
  const path = parsed.pathname.toLowerCase();
  if (/^https?:$/.test(parsed.protocol) && path) {
    if (/\/careers?|\/jobs?|\bwe(?:'|’)re hiring\b|\/join/.test(path))
      return "careers" as const;
    if (/\/docs?|\/documentation|\/developers?|\/api\b|\/reference/.test(path))
      return "docs" as const;
    if (/\/blog|\/news|\/changelog|\/updates|\/releases/.test(path))
      return "blog" as const;
    if (/\/pricing|\/plans/.test(path)) return "pricing" as const;
    if (/\/status/.test(path)) return "status" as const;
    if (/\/community|\/forum|\/discord/.test(path))
      return "community" as const;
  }
  try {
    if (new URL(website).hostname.replace(/^www\./, "") === host.replace(/^www\./, ""))
      return path === "/" || path === "" ? "website" : "other";
  } catch {
    /* Keep the generic category. */
  }
  return "other" as const;
}

function pathTail(url: string, max = 28) {
  try {
    const segment = new URL(url)
      .pathname.replace(/\/$/, "")
      .split("/")
      .filter(Boolean)
      .pop();
    if (!segment) return "";
    const tail = decodeURIComponent(segment)
      .replace(/[-_]+/g, " ")
      .replace(/\.(?:html?|php|aspx?)$/i, "")
      .trim()
      .toLowerCase();
    return tail.length > max ? `${tail.slice(0, max - 1)}…` : tail;
  } catch {
    return "";
  }
}

function fallbackLabel(candidate: Candidate) {
  const base = CATEGORY_LABEL[candidate.category];
  const tail = pathTail(candidate.url);
  if (!tail || CTA_TEXT.test(tail)) return base;
  return `${base} · ${tail}`;
}

function labelFor(candidate: Candidate) {
  const title = candidate.title.replace(/\s+/g, " ").trim();
  const unhelpful =
    !title ||
    title.length > 60 ||
    CTA_TEXT.test(title) ||
    (candidate.category !== "other" &&
      /^(?:home|homepage|menu|skip to (?:content|main))$/i.test(title));
  if (!unhelpful) return title;
  return fallbackLabel(candidate);
}

function extractEmails(pages: { url: string; text: string }[], website: string) {
  let domain = "";
  try {
    domain = new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    /* No domain filter. */
  }
  const found = new Map<string, { email: string; sourceUrl: string }>();
  for (const page of pages) {
    for (const match of page.text.matchAll(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    )) {
      const email = match[0].toLowerCase();
      if (NOISE_EMAIL.test(email)) continue;
      if (/\.(?:png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(email)) continue;
      const emailDomain = email.split("@")[1] ?? "";
      if (NOISE_HOSTS.test(emailDomain)) continue;
      if (domain && emailDomain !== domain && !/^(?:hello|hi|contact|info|careers?|jobs?|hiring|press|support|sales|founders?|team|security|partnerships|recruit(?:ment)?)@/i.test(email))
        continue;
      if (!found.has(email)) found.set(email, { email, sourceUrl: page.url });
    }
  }
  return [...found.values()].slice(0, MAX_EMAILS);
}

async function collectCandidates(company: {
  name: string;
  website: string;
}) {
  const homepageUrl = publicUrlSchema.parse(company.website);
  const homepage = await readCompanyPage(homepageUrl);
  const pages = [homepage];
  const seenPages = new Set([homepage.url]);
  const tryPage = async (url: string) => {
    if (pages.length >= MAX_PAGES || seenPages.has(url)) return;
    seenPages.add(url);
    try {
      pages.push(await readCompanyPage(url));
    } catch {
      /* A missing secondary page never blocks curation. */
    }
  };

  const sameOrigin = (url: string) => {
    try {
      return new URL(url).hostname === new URL(homepageUrl).hostname;
    } catch {
      return false;
    }
  };
  for (const link of homepage.links) {
    if (pages.length >= MAX_PAGES) break;
    if (!sameOrigin(link.url)) continue;
    if (/\/about|\/team|\/contact|\/careers?|\/company\b/i.test(link.url))
      await tryPage(link.url);
  }

  const collect = () => {
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const page of pages) {
      for (const link of page.links) {
        const raw = (() => {
          try {
            return new URL(link.url, page.url).href;
          } catch {
            return "";
          }
        })();
        if (!raw || !publicUrlSchema.safeParse(raw).success) continue;
        const url = canonicalUrl(raw);
        if (seen.has(url) || NOISE_HOSTS.test(new URL(url).hostname)) continue;
        if (url === canonicalUrl(page.url)) continue;
        seen.add(url);
        candidates.push({
          url,
          title: link.title.slice(0, 80),
          context: (link.context ?? "").slice(0, 160),
          category: categorizeLink(url, homepageUrl),
        });
        if (candidates.length >= MAX_CANDIDATES) break;
      }
      if (candidates.length >= MAX_CANDIDATES) break;
    }
    return candidates;
  };
  let candidates = collect();
  const useful = () =>
    candidates.filter(
      (c) => c.category !== "other" && c.category !== "website",
    ).length;

  // JavaScript-heavy sites hide their menu links; probe the usual public pages.
  if (useful() < 4) {
    const origin = new URL(homepageUrl).origin;
    for (const path of ["/careers", "/about", "/jobs", "/contact"]) {
      if (pages.length >= MAX_PAGES || useful() >= 4) break;
      await tryPage(`${origin}${path}`);
      candidates = collect();
    }
  }

  // Emails usually live on the contact page even when the menu is complete.
  if (
    pages.length < MAX_PAGES &&
    !pages.some((page) =>
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(page.text),
    )
  )
    await tryPage(`${new URL(homepageUrl).origin}/contact`);

  candidates.sort((a, b) => inCategoryOrder(a.category, b.category));
  return { homepage, pages, candidates };
}

function pathDepth(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}

function heuristicSelection(
  candidates: Candidate[],
  emails: { email: string }[],
) {
  const byCategory = new Map<CompanyLinkCategory, Candidate[]>();
  for (const candidate of candidates) {
    if (candidate.category === "other") continue;
    const list = byCategory.get(candidate.category) ?? [];
    list.push(candidate);
    byCategory.set(candidate.category, list);
  }
  for (const list of byCategory.values())
    list.sort(
      (a, b) => pathDepth(a.url) - pathDepth(b.url) || a.url.length - b.url.length,
    );

  const picked: { url: string; category: CompanyLinkCategory; label: string }[] =
    [];
  const seen = new Set<string>();
  // One link per category first, then a second shallow link where it helps.
  for (const pass of [0, 1]) {
    for (const category of CATEGORY_ORDER) {
      if (picked.length >= MAX_LINKS) break;
      const candidate = byCategory.get(category)?.[pass];
      if (!candidate || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      picked.push({
        url: candidate.url,
        category,
        label: labelFor(candidate),
      });
    }
  }
  return { links: picked, emails: emails.map((e) => e.email) };
}

const selectionSchema = z.object({
  links: z
    .array(
      z.object({
        url: z.string().max(2048),
        category: companyLinkCategorySchema,
        label: z.string().trim().min(1).max(60),
      }),
    )
    .max(MAX_LINKS),
  emails: z.array(z.string().max(254)).max(MAX_EMAILS),
});

const INSTRUCTIONS = `You curate the useful-links bar for a company profile.
From the provided candidates, choose at most ${MAX_LINKS} official, durable links:
- careers or jobs page,
- GitHub organization or repository,
- documentation or developer docs,
- official LinkedIn or X profile,
- engineering blog, changelog, or news,
- pricing, status page, or community forum.
Prefer the company's own domains and its official profiles. Never invent URLs:
every link must be one of the provided candidate URLs, unchanged. Skip marketing
noise, tag pages, cookie/privacy/legal pages, share links, and duplicates.
Give each link a 1-3 word label (for example "Careers", "GitHub", "Docs",
"Engineering blog"). For emails, return only addresses from the provided list and
prefer role inboxes such as hello, contact, careers, or press.`;

export async function verifyCompanyLinks(companyId: string) {
  const company = await getCompany(companyId);
  if (!company.website)
    throw new HttpError(
      400,
      "Add the company's official website before verifying links.",
    );

  const { homepage, pages, candidates } = await (async () => {
    try {
      return await collectCandidates(company);
    } catch {
      throw new HttpError(
        502,
        "Could not read the company website. Check the address and the crawler service, then try again.",
      );
    }
  })();
  const emails = extractEmails(pages, company.website);
  const candidateByUrl = new Set(candidates.map((c) => c.url));

  let selection = heuristicSelection(candidates, emails);
  if (aiConfigured()) {
    try {
      const result = await withModelSlot(() =>
        generateObject({
          schema: selectionSchema,
          name: "surface_company_links",
          instructions: INSTRUCTIONS,
          input: {
            company: company.name,
            website: company.website,
            candidates: candidates.map((c) => ({
              url: c.url,
              title: c.title,
              category: c.category,
              context: c.context,
            })),
            emails: emails.map((e) => e.email),
          },
          maxOutputTokens: 1600,
          timeoutMs: 60_000,
          feature: "company-links",
          settings: getAiSettings(),
        }),
      );
      const seen = new Set<string>();
      const links = result.output.links
        .filter((link) => {
          if (!candidateByUrl.has(link.url) || seen.has(link.url)) return false;
          seen.add(link.url);
          return true;
        })
        .slice(0, MAX_LINKS)
        .map((link) => ({ ...link, label: link.label.slice(0, 60) }));
      const allowedEmails = new Set(emails.map((e) => e.email));
      selection = {
        links: links.length ? links : selection.links,
        emails: result.output.emails.filter((email) =>
          allowedEmails.has(email.toLowerCase()),
        ),
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && /busy|paused/i.test(error.message))
        throw new HttpError(409, error.message);
      /* The deterministic fallback keeps the feature useful without AI. */
    }
  }

  const checkedAt = new Date().toISOString();
  const rows = selection.links.map((link) => ({
    id: crypto.randomUUID(),
    companyId,
    category: link.category,
    url: link.url,
    label: link.label,
    checkedAt,
  }));
  await transaction(async (tx) => {
    await tx.delete(companyLinks).where(eq(companyLinks.companyId, companyId));
    if (rows.length) await tx.insert(companyLinks).values(rows);
  });

  for (const email of selection.emails) {
    const inbox = emails.find((e) => e.email === email.toLowerCase());
    try {
      await saveContact(
        companyId,
        {
          kind: /^(?:careers?|jobs?|hiring|recruit(?:ment)?)@/i.test(email)
            ? "hiring_inbox"
            : "company_inbox",
          role: "Published company address",
          methods: [
            {
              kind: "email",
              value: email.toLowerCase(),
              sourceUrl: inbox?.sourceUrl ?? homepage.url,
              status: "published",
              checkedAt,
            },
          ],
          evidence: [
            {
              url: inbox?.sourceUrl ?? homepage.url,
              title: company.name,
              excerpt: `Email published on ${inbox?.sourceUrl ?? homepage.url}`,
              retrievedAt: checkedAt,
            },
          ],
        },
        false,
      );
    } catch {
      /* Invalid or duplicate addresses never fail link curation. */
    }
  }

  return companyLinksSchema.parse({
    links: rows,
    checkedAt,
    emails: selection.emails,
  });
}

export async function listCompanyLinks(companyId: string) {
  const rows = await db
    .select()
    .from(companyLinks)
    .where(eq(companyLinks.companyId, companyId))
    .orderBy(asc(companyLinks.category), asc(companyLinks.label));
  return companyLinksSchema.parse({
    links: rows,
    checkedAt: rows[0]?.checkedAt ?? null,
    emails: [],
  });
}
