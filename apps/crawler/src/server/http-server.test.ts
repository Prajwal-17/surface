import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createCrawlerServer } from "./http-server.ts";

// No public network or browser required: exercise the service lifecycle over HTTP.
test("validates input and preserves cancellation after a duplicate request", async (t) => {
  const started = Promise.withResolvers<void>();
  const service = createCrawlerServer(async (_input, signal) => {
    started.resolve();
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
    throw new Error("Expected cancellation");
  });
  await new Promise<void>((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(() => {
    service.stop();
    service.server.closeAllConnections();
  });
  const base = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

  for (const input of [
    null,
    {},
    { id: "test", url: "https://example.com", render: "yes" },
  ]) {
    const invalid = await post("/crawl", input);
    assert.equal(invalid.status, 422);
    await invalid.json();
  }
  const pending = post("/crawl", { id: "test", url: "https://example.com" });
  await started.promise;
  const duplicate = await post("/crawl", {
    id: "test",
    url: "https://example.com",
  });
  assert.equal(duplicate.status, 409);
  await duplicate.json();
  const cancel = await post("/crawl/test/cancel", {});
  assert.equal(cancel.status, 200);
  await cancel.json();
  const cancelled = await pending;
  assert.equal(cancelled.status, 422);
  assert.deepEqual(await cancelled.json(), { error: "Crawl cancelled." });
  const health = await fetch(`${base}/health`);
  assert.deepEqual(await health.json(), {
    status: "ok",
    crawler: "Crawlee",
    active: 0,
  });
});
