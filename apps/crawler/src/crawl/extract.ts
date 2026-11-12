import type { CheerioCrawlingContext } from "crawlee";
import type { CrawlMetadata } from "../types.ts";
import type { CrawlResult } from "../types.ts";
import { validateUrl } from "../network/destination.ts";

export function extractPage(
  $: CheerioCrawlingContext["$"],
  url: string,
): CrawlResult {
  const metadata = extractMetadata($, url);
  const title = $("title").first().text().trim();
  const links: CrawlResult["links"] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, element) => {
    try {
      const href = new URL($(element).attr("href") ?? "", url);
      href.hash = "";
      validateUrl(href.href);
      if (!seen.has(href.href) && links.length < 1000) {
        seen.add(href.href);
        links.push({
          url: href.href,
          title: $(element).text().trim().slice(0, 300),
          context: $(element)
            .closest("p,li")
            .text()
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1000),
        });
      }
    } catch {
      /* Non-page links are not crawler targets. */
    }
  });
  $("script,style,noscript,svg,canvas,iframe,nav,footer,header").remove();
  $("br").replaceWith("\n");
  $("p,li,h1,h2,h3,h4,section,article,div").append("\n");
  const text = (
    $("main").text().trim() ||
    $("article").text().trim() ||
    $("body").text()
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
  if (text.length > 500000)
    throw new Error("Page text exceeds extraction size limit.");
  return {
    url,
    title,
    text,
    links,
    metadata,
    status: "ok",
    retrievedAt: new Date().toISOString(),
  };
}

// Capture identity and contact evidence while headers, footers and JSON-LD still exist.
export function extractMetadata(
  $: CheerioCrawlingContext["$"],
  base: string,
): CrawlMetadata {
  const result: CrawlMetadata = {
    description:
      $("meta[name='description']").attr("content") ??
      $("meta[property='og:description']").attr("content") ??
      "",
    siteName: $("meta[property='og:site_name']").attr("content") ?? "",
    emails: [],
    people: [],
    images: [],
    structuredData: [],
    publishedAt:
      $("meta[property='article:published_time']").attr("content") ?? null,
    directoryCompany: null,
  };
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const link = (s: unknown) => {
    if (typeof s !== "string" || !s.trim()) return null;
    try {
      const u = new URL(String(s), base);
      validateUrl(u.href);
      return u.href;
    } catch {
      return null;
    }
  };
  const image = (value: unknown, kind: "logo" | "favicon", source: string) => {
    const url = link(
      typeof value === "object" && value
        ? (value as Record<string, unknown>).url
        : value,
    );
    if (
      url &&
      !result.images.some((i) => i.url === url) &&
      result.images.length < 30
    )
      result.images.push({ url, kind, source });
  };
  const person = (v: Record<string, unknown>) => {
    const name = String(v.name ?? "");
    if (!name || name.length > 200) return;
    const profiles = (Array.isArray(v.sameAs) ? v.sameAs : [v.sameAs, v.url])
      .map(link)
      .filter((url): url is string => Boolean(url));
    const email =
      typeof v.email === "string"
        ? v.email.replace(/^mailto:/i, "")
        : undefined;
    if (!result.people.some((p) => p.name === name))
      result.people.push({
        name,
        role: String(v.jobTitle ?? "Team member").slice(0, 200),
        profiles,
        ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
      });
  };
  const visit = (v: unknown, depth = 0) => {
    if (depth > 10 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const i of v.slice(0, 100)) visit(i, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>,
      type = String(o["@type"] ?? "");
    if (/Person/.test(type)) person(o);
    if (/Organization|Corporation/.test(type))
      image(o.logo, "logo", "structured organization logo");
    if (
      /Article|NewsArticle|BlogPosting/.test(type) &&
      typeof o.datePublished === "string"
    )
      result.publishedAt = o.datePublished;
    for (const value of Object.values(o)) visit(value, depth + 1);
  };
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const s = $(el).text();
      if (s.length > 150000) return;
      const d: unknown = JSON.parse(s);
      result.structuredData.push(d);
      visit(d);
    } catch {
      /* Unusable metadata does not invalidate the page. */
    }
  });
  // YC's public Inertia response is evidence; has_email is intentionally ignored.
  if (new URL(base).hostname.replace(/^www\./, "") === "ycombinator.com") {
    $("[data-page]").each((_, el) => {
      try {
        const data = JSON.parse($(el).attr("data-page") ?? "{}"),
          c = data.props?.company;
        if (c && c.id && c.name) {
          result.directoryCompany = {
            id: c.id,
            slug: c.slug,
            name: c.name,
            website: c.website,
            batch: c.batch_name,
            description: c.one_liner,
            location: c.location,
            tags: c.tags,
          };
          result.description = c.one_liner ?? result.description;
          image(c.small_logo_url, "logo", "YC company profile");
          for (const f of (c.founders ?? []).slice(0, 20))
            person({
              name: f.full_name,
              jobTitle: f.title || "Founder",
              sameAs: [f.linkedin_url, f.twitter_url].filter(Boolean),
            });
        }
      } catch {
        /* A directory shell may not have a company. */
      }
    });
  }
  $("link[rel]").each((_, el) => {
    if (
      /(?:^|\s)(?:icon|apple-touch-icon|shortcut)(?:\s|$)/i.test(
        $(el).attr("rel") ?? "",
      )
    )
      image($(el).attr("href"), "favicon", "website icon");
  });
  $("img[src]").each((_, el) => {
    const label = [
      $(el).attr("alt"),
      $(el).attr("class"),
      $(el).attr("id"),
    ].join(" ");
    const brand = (result.siteName || $("title").text().split(/[|–—]/)[0] || "")
      .trim()
      .toLowerCase();
    if (
      /logo/i.test(label) &&
      ($(el).closest("header,nav,footer").length ||
        (brand && ($(el).attr("alt") ?? "").toLowerCase().includes(brand)))
    )
      image($(el).attr("src"), "logo", "website logo image");
  });
  $("a[href^='mailto:']").each((_, el) => {
    let raw = "";
    try {
      raw = decodeURIComponent(
        ($(el).attr("href") ?? "").slice(7).split("?")[0]!,
      );
    } catch {
      return;
    }
    const container = $(el).closest(
      "[itemtype*='Person'],[class*='founder'],[class*='member'],[class*='person'],[class*='contact'],li,p",
    );
    const context = clean(
      (container.length ? container : $(el).parent()).text(),
    ).slice(0, 700);
    const name = clean(container.find("[itemprop='name']").first().text()),
      role = clean(container.find("[itemprop='jobTitle']").first().text());
    for (const email of raw.split(/[,;]/).map((v) => v.trim().toLowerCase())) {
      if (
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        result.emails.length < 100 &&
        !result.emails.some((e) => e.email === email)
      )
        result.emails.push({
          email,
          context,
          ...(name ? { name } : {}),
          ...(role ? { role } : {}),
        });
    }
  });
  $("[itemtype*='Person'],[class*='founder'],[class*='team-member']")
    .slice(0, 30)
    .each((_, el) => {
      if (
        $(el).find(
          "[itemtype*='Person'],[class*='founder'],[class*='team-member']",
        ).length
      )
        return;
      const name = clean(
        $(el).find("[itemprop='name'],h2,h3,h4").first().text(),
      );
      const role = clean(
        $(el)
          .find("[itemprop='jobTitle'],[class*='role'],[class*='title']")
          .first()
          .text(),
      );
      if (
        name &&
        name.split(" ").length <= 6 &&
        /founder|CEO|CTO|engineer|hiring|recruit|chief|head of/i.test(role)
      ) {
        const profiles: string[] = [];
        $(el)
          .find("a[href]")
          .each((_index, a) => {
            const u = link($(a).attr("href"));
            if (
              u &&
              /linkedin\.com\/in\/|github\.com\/|(?:twitter|x)\.com\//.test(u)
            )
              profiles.push(u);
          });
        person({ name, jobTitle: role, sameAs: profiles });
      }
    });
  // Visible published addresses with no explicit person association stay company inboxes.
  const body = $("body").clone();
  body.find("script,style,noscript").remove();
  const visible = clean(body.text());
  for (const match of visible.matchAll(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  )) {
    const email = match[0].toLowerCase();
    if (result.emails.length >= 100) break;
    if (!result.emails.some((e) => e.email === email))
      result.emails.push({
        email,
        context: visible.slice(
          Math.max(0, match.index - 100),
          match.index + email.length + 100,
        ),
      });
  }
  return result;
}
