import { createRequire } from "node:module";
import { safeGet } from "../network/safe-get.ts";

// The package is CommonJS; load its callable export directly.
const parseRobots: typeof import("robots-parser").default = createRequire(
  import.meta.url,
)("robots-parser");

export async function assertRobotsAllowed(url: string, signal: AbortSignal) {
  const robotsUrl = new URL("/robots.txt", url).href;
  const response = await safeGet(robotsUrl, signal);
  if (response.status === 404 || response.status === 410) return;
  if (response.status !== 200)
    throw new Error(`Cannot verify robots.txt (HTTP ${response.status}).`);
  if (
    parseRobots(robotsUrl, response.body).isAllowed(url, "SurfaceResearch") ===
    false
  )
    throw new Error("This page is disallowed by robots.txt.");
}
