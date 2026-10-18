import type { CheerioCrawlingContext } from "crawlee";
import type { CrawlResult } from "../types.ts";
import { validateUrl } from "../network/destination.ts";

export function extractPage(
  $: CheerioCrawlingContext["$"],
  url: string,
): CrawlResult {
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
    status: "ok",
    retrievedAt: new Date().toISOString(),
  };
}
