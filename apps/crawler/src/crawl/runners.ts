import {
  CheerioCrawler,
  PlaywrightCrawler,
  Configuration,
  ProxyConfiguration,
  type Request,
} from "crawlee";
import type { Browser } from "playwright";
import type { CrawlResult } from "../types.ts";
import { extractPage } from "./extract.ts";
import { prepareBrowser } from "./browser.ts";

function crawlerOptions(proxyUrl: string) {
  return {
    maxConcurrency: 1,
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 40,
    proxyConfiguration: new ProxyConfiguration({ proxyUrls: [proxyUrl] }),
    useSessionPool: false,
    failedRequestHandler: async ({ request }: { request: Request }) => {
      throw new Error(request.errorMessages.at(-1) || "Crawl failed.");
    },
  };
}

async function runCrawler(
  crawler: CheerioCrawler | PlaywrightCrawler,
  url: string,
  signal: AbortSignal,
  closeBrowser?: () => Promise<void>,
) {
  const abort = () => {
    void crawler.autoscaledPool?.abort();
    void closeBrowser?.().catch(() => {});
  };
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await crawler.run([{ url, uniqueKey: crypto.randomUUID() }]);
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", abort);
    await crawler.teardown();
  }
}

export async function readHtml(
  url: string,
  proxyUrl: string,
  signal: AbortSignal,
) {
  let result: CrawlResult | undefined;
  const crawler = new CheerioCrawler(
    {
      ...crawlerOptions(proxyUrl),
      preNavigationHooks: [
        async (_context, options) => {
          options.headers = {
            ...options.headers,
            "User-Agent": "SurfaceResearch/1.0",
          };
          // A redirect falls back to the browser, which checks every navigation.
          options.followRedirect = false;
        },
      ],
      requestHandler: async ({ $, request, response }) => {
        if ((response.statusCode ?? 502) >= 300) {
          throw new Error(
            `Page returned HTTP ${response.statusCode}; browser rendering is required.`,
          );
        }
        result = extractPage($, request.loadedUrl || request.url);
      },
    },
    new Configuration({ persistStorage: false }),
  );
  await runCrawler(crawler, url, signal);
  return result;
}

export async function readBrowser(
  url: string,
  proxyUrl: string,
  signal: AbortSignal,
) {
  let result: CrawlResult | undefined;
  let browser: Browser | null = null;
  const crawler = new PlaywrightCrawler(
    {
      ...crawlerOptions(proxyUrl),
      headless: true,
      navigationTimeoutSecs: 30,
      launchContext: {
        useIncognitoPages: true,
        launchOptions: {
          args: [
            "--proxy-bypass-list=<-loopback>",
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            "--disable-background-networking",
          ],
        },
      },
      browserPoolOptions: {
        useFingerprints: false,
        prePageCreateHooks: [
          (_id, _controller, options) => {
            if (options) {
              options.serviceWorkers = "block";
              options.acceptDownloads = false;
            }
          },
        ],
      },
      preNavigationHooks: [
        async ({ page }) => {
          browser = page.context().browser();
          await prepareBrowser(page, signal);
        },
      ],
      requestHandler: async ({ page, request, response, parseWithCheerio }) => {
        if (!response?.ok()) {
          throw new Error(
            `Page returned HTTP ${response?.status() ?? "unknown"}.`,
          );
        }
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => {});
        result = extractPage(
          await parseWithCheerio(),
          page.url() || request.url,
        );
      },
    },
    new Configuration({ persistStorage: false }),
  );
  await runCrawler(crawler, url, signal, async () => {
    await browser?.close();
  });
  return result;
}
