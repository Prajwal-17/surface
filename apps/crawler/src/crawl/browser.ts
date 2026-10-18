import type { Page } from "playwright";
import { validateUrl } from "../network/destination.ts";
import { assertRobotsAllowed } from "./robots.ts";

/** Restrict browser traffic; the egress proxy separately validates and pins DNS. */
export async function prepareBrowser(page: Page, signal: AbortSignal) {
  const context = page.context();
  await context.setExtraHTTPHeaders({ "User-Agent": "SurfaceResearch/1.0" });
  await context.routeWebSocket("**/*", (socket) => socket.close());

  let requests = 0;
  await context.route("**/*", async (route) => {
    try {
      signal.throwIfAborted();
      const request = route.request();
      const skip =
        ++requests > 200 ||
        ["image", "media", "font"].includes(request.resourceType()) ||
        !["GET", "HEAD"].includes(request.method());
      if (skip) {
        await route.abort();
        return;
      }
      validateUrl(request.url());
      if (request.isNavigationRequest()) {
        await assertRobotsAllowed(request.url(), signal);
      }
      await route.continue();
    } catch {
      await route.abort().catch(() => {});
    }
  });
}
