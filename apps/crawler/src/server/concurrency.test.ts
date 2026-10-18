import { test } from "node:test";
import assert from "node:assert/strict";
import { CrawlSlots } from "./concurrency.ts";

test("cancelled waiters are skipped without leaking slots", async () => {
  const slots = new CrawlSlots(1);
  const signal = new AbortController().signal;
  await slots.acquire(signal);
  const cancelled = new AbortController();
  const cancelledWait = slots.acquire(cancelled.signal);
  const rejected = assert.rejects(cancelledWait, /cancelled/);
  let entered = false;
  const next = slots.acquire(signal).then(() => {
    entered = true;
  });
  cancelled.abort(new Error("cancelled"));
  await rejected;
  assert.equal(entered, false);
  assert.equal(slots.active, 1);
  slots.release();
  await next;
  assert.equal(slots.active, 1);
  slots.release();
  assert.equal(slots.active, 0);
});
