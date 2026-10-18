import type { CrawlPage, CrawlResult } from "../types.ts";
import { publicDestination, validateUrl } from "../network/destination.ts";
import { assertRobotsAllowed } from "./robots.ts";
import { readHtml, readBrowser } from "./runners.ts";

export function createCrawler(proxyUrl: string): CrawlPage {
  return async (input, signal) => {
    const url = validateUrl(input.url).href;
    await publicDestination(new URL(url).hostname);
    await assertRobotsAllowed(url, signal);

    let result: CrawlResult | undefined;
    if (!input.render) {
      try {
        result = await readHtml(url, proxyUrl, signal);
      } catch {
        // Static pages may need JavaScript or redirect handling.
        signal.throwIfAborted();
      }
    }
    if (input.render || !result || result.text.length < 400) {
      result = await readBrowser(url, proxyUrl, signal);
    }
    if (!result?.text) throw new Error("No readable public content was found.");
    if (result.text.length < 400) {
      result.status = "partial: limited readable content after rendering";
    }
    return result;
  };
}
