import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { CrawlPage } from "../types.ts";
import { CrawlSlots } from "./concurrency.ts";
import { readCrawlInput, sendJson } from "./request.ts";

export function createCrawlerServer(crawlPage: CrawlPage) {
  const active = new Map<string, AbortController>();
  const slots = new CrawlSlots(3);

  async function handleCrawl(req: IncomingMessage, res: ServerResponse) {
    let held = false;
    let registeredId: string | undefined;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(75000),
    ]);
    res.on("close", () => {
      if (!res.writableEnded)
        controller.abort(new Error("Caller disconnected."));
    });
    try {
      const input = await readCrawlInput(req);
      if (active.has(input.id)) {
        sendJson(res, 409, { error: "Crawl already running." });
        return;
      }
      active.set(input.id, controller);
      registeredId = input.id;
      await slots.acquire(signal);
      held = true;
      signal.throwIfAborted();
      sendJson(res, 200, await crawlPage(input, signal));
    } catch (error) {
      sendJson(res, 422, {
        error: error instanceof Error ? error.message : "Crawl failed.",
      });
    } finally {
      if (held) slots.release();
      if (registeredId) active.delete(registeredId);
    }
  }

  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      sendJson(res, 200, {
        status: "ok",
        crawler: "Crawlee",
        active: slots.active,
      });
      return;
    }
    const cancel = /^\/crawl\/([\w-]+)\/cancel$/.exec(req.url ?? "");
    if (req.method === "POST" && cancel) {
      active.get(cancel[1]!)?.abort(new Error("Crawl cancelled."));
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && req.url === "/crawl") {
      await handleCrawl(req, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  });

  return {
    server,
    stop() {
      for (const controller of active.values()) controller.abort();
      server.close();
    },
  };
}
