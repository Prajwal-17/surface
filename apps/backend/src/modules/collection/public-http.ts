import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { publicUrlSchema } from "@surface/contracts";
import { env } from "../../config/env";
const blocked = new BlockList();
const blocked6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return (
    Boolean(family) &&
    (family !== 6 || /^[23]/.test(address)) &&
    !(family === 6 ? blocked6 : blocked).check(
      address,
      family === 6 ? "ipv6" : "ipv4",
    )
  );
}
export class FetchFailure extends Error {
  constructor(
    message: string,
    public retryAt: string | null = null,
    public statusCode = 0,
  ) {
    super(message);
  }
}
export interface FetchedPayload {
  url: string;
  body: string;
  rawBytes?: Uint8Array;
  mediaType: string;
  statusCode: number;
}
export async function fetchPublic(
  input: string,
  outerSignal?: AbortSignal,
): Promise<FetchedPayload> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(env.SOURCE_TIMEOUT_MS),
    ...(outerSignal ? [outerSignal] : []),
  ]);
  let next = input;
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    const url = new URL(publicUrlSchema.parse(next));
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    )
      throw new FetchFailure(
        "Unsupported: private-network URLs cannot be collected.",
      );
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await Promise.race([
          lookup(hostname, { all: true }),
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
        ]);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new FetchFailure(
        "Unsupported: the destination resolves to a private or reserved network.",
      );
    const address = addresses[0]!;
    const result = await new Promise<FetchedPayload & { location?: string }>(
      (resolve, reject) => {
        const request = (
          url.protocol === "https:" ? httpsRequest : httpRequest
        )(
          url,
          {
            signal,
            agent: false,
            headers: {
              "User-Agent": "Fieldwork/1.0 (local personal job monitoring)",
              Accept:
                "application/json, application/rss+xml, text/html, text/xml",
              "Accept-Encoding": "identity",
            },
            lookup: (_hostname, options, callback) =>
              callback(
                null,
                options.all ? [address] : address.address,
                address.family,
              ),
          },
          (response) => {
            const code = response.statusCode ?? 0;
            if ([301, 302, 303, 307, 308].includes(code)) {
              response.destroy();
              resolve({
                url: url.href,
                body: "",
                statusCode: code,
                mediaType: "",
                location: response.headers.location,
              });
              return;
            }
            if (code < 200 || code >= 300) {
              response.destroy();
              const retry = response.headers["retry-after"];
              const raw = Array.isArray(retry) ? retry[0] : retry;
              const date = raw
                ? /^\d+$/.test(raw)
                  ? Date.now() + Number(raw) * 1000
                  : Date.parse(raw)
                : NaN;
              reject(
                new FetchFailure(
                  `Source returned HTTP ${code}.`,
                  Number.isFinite(date) ? new Date(date).toISOString() : null,
                  code,
                ),
              );
              return;
            }
            if (
              response.headers["content-encoding"] &&
              response.headers["content-encoding"] !== "identity"
            ) {
              response.destroy();
              reject(
                new FetchFailure(
                  "Compressed response unavailable; server ignored identity encoding.",
                ),
              );
              return;
            }
            const max = 8 * 1024 * 1024;
            if (Number(response.headers["content-length"] ?? 0) > max) {
              response.destroy();
              reject(new FetchFailure("Response exceeds the 8 MiB limit."));
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            response.on("data", (chunk) => {
              size += chunk.length;
              if (size > max) {
                response.destroy(
                  new FetchFailure("Response exceeds the 8 MiB limit."),
                );
                return;
              }
              chunks.push(Buffer.from(chunk));
            });
            response.on("error", reject);
            response.on("end", () =>
              resolve({
                url: url.href,
                body: Buffer.concat(chunks).toString("utf8"),
                rawBytes: Buffer.concat(chunks),
                statusCode: code,
                mediaType: String(
                  response.headers["content-type"] ??
                    "application/octet-stream",
                ).split(";")[0]!,
              }),
            );
          },
        );
        request.on("error", reject);
        request.end();
      },
    );
    if (![301, 302, 303, 307, 308].includes(result.statusCode)) return result;
    if (!result.location)
      throw new FetchFailure("Redirect has no destination.");
    next = new URL(result.location, url).href;
  }
  throw new FetchFailure("Too many redirects.");
}
