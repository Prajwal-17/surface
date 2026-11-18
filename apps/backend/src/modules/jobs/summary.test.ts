import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
} from "ai";
import {
  DESCRIPTION_SUMMARY_FORMAT_VERSION,
  type DescriptionSummary,
} from "@surface/contracts";

const directory = mkdtempSync(join(tmpdir(), "surface-summary-test-"));
process.env.APP_ENV = "test";
process.env.SQLITE_DATABASE_FILE = ":memory:";
process.env.DATA_DIR = directory;
delete process.env.OMNIROUTE_API_KEY;
delete process.env.OMNIROUTE_BASE_URL;
process.env.OPENCODE_GO_API_KEY = "test-key";
process.env.AI_PROVIDER = "opencode-go";
process.env.AI_BASE_URL = "http://summary-model.test/v1";
process.env.AI_MODEL = "test";

const { runMigrations } = await import("../../infrastructure/database/migrate");
const { closeDatabase, db } =
  await import("../../infrastructure/database/client");
const { app } = await import("../../app");
const { jobs } = await import("./jobs.tables");
const { eq } = await import("drizzle-orm");

const originalFetch = globalThis.fetch;
let cookie = "";
let mode: "normal" | "broken" = "normal";
let providerRequests = 0;
const jobId = crypto.randomUUID();

const authenticatedRequest = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Cookie", cookie);
  return app.request(path, { ...init, headers });
};

const sse = (chunks: string[], finish: boolean) => {
  const encoder = new TextEncoder();
  const events = [
    {
      id: "s",
      model: "server-model",
      choices: [{ index: 0, delta: { role: "assistant" } }],
    },
    ...chunks.map((content) => ({
      id: "s",
      model: "server-model",
      choices: [{ index: 0, delta: { content } }],
    })),
    ...(finish
      ? [
          {
            id: "s",
            model: "server-model",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          },
        ]
      : []),
  ];
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        if (finish) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
};

beforeAll(async () => {
  await runMigrations();
  globalThis.fetch = (async (
    input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    if (!String(input).startsWith("http://summary-model.test"))
      throw new Error(`Unexpected network destination ${String(input)}`);
    providerRequests++;
    return sse(
      mode === "broken"
        ? ['{"text":"Partial draft']
        : ['{"text":"Hello ', "**world**", '"}'],
      mode === "normal",
    );
  }) as typeof fetch;
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "summary-test@example.com" }),
  });
  expect(login.status).toBe(200);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const now = new Date().toISOString();
  await db.insert(jobs).values({
    id: jobId,
    dedupeKey: `summary-test-${jobId}`,
    canonicalUrl: "https://example.com/jobs/1",
    title: "Platform Engineer",
    company: "Example",
    description: "Build reliable systems with TypeScript and SQLite.",
    applyUrl: "https://example.com/jobs/1/apply",
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    currentVersionId: "version-1",
  });
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await closeDatabase();
  rmSync(directory, { recursive: true });
});

async function readSummaryStream(response: Response) {
  expect(response.ok).toBe(true);
  const chunks = parseJsonEventStream({
    stream: response.body!,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) throw chunk.error;
        controller.enqueue(chunk.value);
      },
    }),
  );
  let text = "";
  let summary: DescriptionSummary | undefined;
  let error: string | undefined;
  for await (const message of readUIMessageStream({ stream: chunks })) {
    text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    for (const part of message.parts) {
      if (part.type !== "data-summary") continue;
      const data = part.data as
        | { status: "complete"; summary: DescriptionSummary }
        | { status: "error"; error: string };
      if (data.status === "complete") summary = data.summary;
      else error = data.error;
    }
  }
  return { text, summary, error };
}

describe("job summary stream", () => {
  test("streams provisional text and persists the validated summary", async () => {
    const response = await authenticatedRequest(
      `/api/jobs/${jobId}/summary/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: false }),
      },
    );
    const result = await readSummaryStream(response);
    expect(result.text).toBe("Hello **world**");
    expect(result.summary?.text).toBe("Hello **world**");
    expect(result.summary?.jobVersionId).toBe("version-1");
    expect(result.summary?.formatVersion).toBe(
      DESCRIPTION_SUMMARY_FORMAT_VERSION,
    );
    expect(result.error).toBeUndefined();
    const saved = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!;
    expect(saved.descriptionSummary?.text).toBe("Hello **world**");
    expect(providerRequests).toBe(1);
  });

  test("serves a cached summary without paying for another generation", async () => {
    const response = await authenticatedRequest(
      `/api/jobs/${jobId}/summary/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: false }),
      },
    );
    const result = await readSummaryStream(response);
    expect(result.summary?.text).toBe("Hello **world**");
    expect(providerRequests).toBe(1);
  });

  test("a failed regeneration keeps the previous saved summary", async () => {
    mode = "broken";
    const response = await authenticatedRequest(
      `/api/jobs/${jobId}/summary/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      },
    );
    const result = await readSummaryStream(response);
    expect(result.text).toBe("Partial draft");
    expect(result.summary).toBeUndefined();
    expect(result.error).toBeTruthy();
    const saved = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!;
    expect(saved.descriptionSummary?.text).toBe("Hello **world**");
    mode = "normal";
  });

  test("the non-streaming endpoint remains compatible", async () => {
    const response = await authenticatedRequest(`/api/jobs/${jobId}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: false }),
    });
    expect(response.status).toBe(200);
    const summary = (await response.json()) as DescriptionSummary;
    expect(summary.text).toBe("Hello **world**");
  });
});
