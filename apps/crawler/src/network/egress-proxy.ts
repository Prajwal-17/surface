import { connect, type Socket } from "node:net";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { validateUrl, publicDestination } from "./destination.ts";
import { pinnedLookup } from "./pinned-lookup.ts";

async function proxyHttp(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = validateUrl(req.url ?? ""),
      address = await publicDestination(url.hostname);
    const headers = { ...req.headers };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    const upstream = httpRequest(
      url,
      {
        method: req.method,
        headers,
        agent: false,
        lookup: pinnedLookup(address),
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        let received = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          if (received > 8 * 1024 * 1024) {
            response.destroy();
            res.destroy();
          }
        });
        response.pipe(res);
      },
    );
    upstream.setTimeout(30000, () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(502);
        res.end();
      } else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  } catch {
    res.writeHead(403);
    res.end("Destination blocked");
  }
}

// CONNECT is pinned to the validated IP, including browser subrequests.
async function proxyConnect(
  req: IncomingMessage,
  client: Duplex,
  head: Buffer,
) {
  let remote: Socket | undefined;
  client.on("error", () => remote?.destroy());
  try {
    const url = validateUrl(`https://${req.url}`),
      address = await publicDestination(url.hostname);
    if (client.destroyed) return;
    const upstream = connect({
      host: address.address,
      port: Number(url.port || 443),
      family: address.family,
    });
    remote = upstream;
    upstream.setTimeout(45000, () => upstream.destroy());
    let received = 0;
    upstream.on("data", (chunk) => {
      received += chunk.length;
      if (received > 32 * 1024 * 1024) {
        upstream.destroy();
        client.destroy();
      }
    });
    upstream.on("error", () => client.destroy());
    upstream.on("close", () => client.destroy());
    client.on("close", () => upstream.destroy());
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
  } catch {
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  }
}

export function createEgressProxy() {
  const server = createServer(proxyHttp);
  server.on("connect", proxyConnect);
  return server;
}
