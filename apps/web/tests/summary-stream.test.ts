import { afterEach, describe, expect, test } from "bun:test";
import type { DescriptionSummary } from "@surface/contracts";
import { streamSummary } from "../src/features/jobs/summary-stream";

const originalFetch = globalThis.fetch;
const summary: DescriptionSummary = {
  text: "Hello **world**",
  formatVersion: 3,
  jobVersionId: "version-1",
  generatedAt: "2026-11-17T00:00:00.000Z",
};

const sse = (chunks: unknown[]) =>
  new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("job summary UI stream", () => {
  test("accumulates text snapshots and reads the persisted completion record", async () => {
    globalThis.fetch = (async () =>
      sse([
        { type: "start" },
        { type: "text-start", id: "summary-text" },
        { type: "text-delta", id: "summary-text", delta: "Hello " },
        { type: "text-delta", id: "summary-text", delta: "**world**" },
        { type: "text-end", id: "summary-text" },
        {
          type: "data-summary",
          id: "summary",
          data: { status: "complete", summary },
        },
      ])) as unknown as typeof fetch;
    const updates: string[] = [];
    const result = await streamSummary("job-1", false, (text) =>
      updates.push(text),
    );
    expect(result).toEqual(summary);
    expect(updates.at(-1)).toBe("Hello **world**");
  });

  test("surfaces an error record and never treats partial text as success", async () => {
    globalThis.fetch = (async () =>
      sse([
        { type: "start" },
        { type: "text-start", id: "summary-text" },
        { type: "text-delta", id: "summary-text", delta: "Partial" },
        { type: "text-end", id: "summary-text" },
        {
          type: "data-summary",
          id: "summary",
          data: { status: "error", error: "The AI provider failed." },
        },
      ])) as unknown as typeof fetch;
    await expect(streamSummary("job-1", true, () => {})).rejects.toThrow(
      "The AI provider failed.",
    );
  });

  test("reports an early stream close instead of returning a draft", async () => {
    globalThis.fetch = (async () =>
      sse([
        { type: "start" },
        { type: "text-start", id: "summary-text" },
        { type: "text-delta", id: "summary-text", delta: "Partial" },
      ])) as unknown as typeof fetch;
    await expect(streamSummary("job-1", false, () => {})).rejects.toThrow(
      "The summary connection ended early",
    );
  });
});
