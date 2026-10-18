import type { IncomingMessage, ServerResponse } from "node:http";
import type { CrawlInput } from "../types.ts";

export function sendJson(res: ServerResponse, status: number, value: unknown) {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

export async function readCrawlInput(
  req: IncomingMessage,
): Promise<CrawlInput> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10000) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  const input: unknown = JSON.parse(Buffer.concat(chunks).toString());
  if (
    !input ||
    typeof input !== "object" ||
    !("url" in input) ||
    typeof input.url !== "string" ||
    input.url.length > 2048 ||
    !("id" in input) ||
    typeof input.id !== "string" ||
    !/^[\w-]{1,100}$/.test(input.id) ||
    ("render" in input &&
      input.render !== undefined &&
      typeof input.render !== "boolean")
  ) {
    throw new Error("Invalid crawl request.");
  }
  return {
    id: input.id,
    url: input.url,
    render:
      "render" in input && typeof input.render === "boolean"
        ? input.render
        : undefined,
  };
}
