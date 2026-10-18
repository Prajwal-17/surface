import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { validateUrl, publicDestination } from "./destination.ts";
import { pinnedLookup } from "./pinned-lookup.ts";

export async function safeGet(
  input: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<{ status: number; body: string }> {
  if (redirects > 5) throw new Error("Too many redirects.");
  const url = validateUrl(input),
    address = await publicDestination(url.hostname);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        agent: false,
        headers: {
          "User-Agent": "SurfaceResearch/1.0",
          "Accept-Encoding": "identity",
        },
        lookup: pinnedLookup(address),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
          res.destroy();
          if (!res.headers.location) {
            reject(new Error("Redirect missing destination."));
            return;
          }
          resolve(
            safeGet(
              new URL(res.headers.location, url).href,
              signal,
              redirects + 1,
            ),
          );
          return;
        }
        let size = 0;
        const parts: Buffer[] = [];
        res.on("data", (part) => {
          size += part.length;
          if (size > 1024 * 1024)
            res.destroy(new Error("Robots response too large."));
          else parts.push(part);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 502,
            body: Buffer.concat(parts).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}
