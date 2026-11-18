import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  activeModelRequests,
  acquireModelSlot,
  BusyAiError,
  withModelSlot,
} from "./capacity";
import { AiError } from "./errors";
import { generateObject, generateTextResult, streamObject } from "./generation";
import { resetAiProviderCache } from "./provider";
import { updateRuntimeSettings } from "../../config/runtime";

process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";

const originalFetch = globalThis.fetch;
let requests: { url: string; body: any; authorization: string | null }[] = [];
let respond: (body: any) => Response = () =>
  new Response("unexpected", { status: 500 });

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const textResponse = (text: string, finishReason = "stop") =>
  json({
    id: "test",
    model: "server-model",
    choices: [
      {
        finish_reason: finishReason,
        message: { role: "assistant", content: text },
      },
    ],
  });
const sse = (chunks: string[], finishReason = "stop") => {
  const encoder = new TextEncoder();
  const events = [
    {
      id: "test",
      model: "server-model",
      choices: [{ index: 0, delta: { role: "assistant" } }],
    },
    ...chunks.map((content) => ({
      id: "test",
      model: "server-model",
      choices: [{ index: 0, delta: { content } }],
    })),
    {
      id: "test",
      model: "server-model",
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    },
  ];
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
};

beforeEach(() => {
  requests = [];
  resetAiProviderCache();
  updateRuntimeSettings({
    provider: "opencode-go",
    baseUrl: "http://ai.test/v1",
    apiKey: "test-key",
    model: "client-model",
    reasoning: "default",
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  resetAiProviderCache();
  updateRuntimeSettings({ apiKey: "" });
});

globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const headers = new Headers(init?.headers);
  requests.push({
    url,
    body,
    authorization: headers.get("authorization"),
  });
  return respond(body);
}) as typeof fetch;
const mockFetch = globalThis.fetch;

describe("AI capacity", () => {
  test("rejects unsupported providers and invalid URLs", () => {
    expect(() => updateRuntimeSettings({ provider: "other" })).toThrow(
      "Unsupported AI provider",
    );
    expect(() =>
      updateRuntimeSettings({ baseUrl: "ftp://example.com" }),
    ).toThrow("must use http or https");
    expect(() => updateRuntimeSettings({ model: "  " })).toThrow(
      "AI model is required",
    );
  });

  test("admits two requests and fails fast for a third", () => {
    const first = acquireModelSlot();
    const second = acquireModelSlot();
    expect(activeModelRequests()).toBe(2);
    expect(() => acquireModelSlot()).toThrow(BusyAiError);
    first.release();
    first.release();
    expect(activeModelRequests()).toBe(1);
    second.release();
    expect(activeModelRequests()).toBe(0);
  });

  test("releases a slot when the operation fails", async () => {
    await expect(
      withModelSlot(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(activeModelRequests()).toBe(0);
  });
});

describe("structured generation", () => {
  test("sends a schema through the configured provider and validates output", async () => {
    respond = () => textResponse('{"text":"Hello"}');
    const result = await generateObject({
      schema: z.object({ text: z.string() }).strict(),
      name: "surface_test",
      instructions: "Return JSON",
      input: { value: 1 },
      maxOutputTokens: 100,
      feature: "test",
    });
    expect(result.output.text).toBe("Hello");
    expect(result.model).toBe("server-model");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://ai.test/v1/chat/completions");
    expect(requests[0]!.authorization).toBe("Bearer test-key");
    expect(requests[0]!.body.model).toBe("client-model");
    expect(requests[0]!.body.reasoning_effort).toBeUndefined();
    expect(requests[0]!.body.response_format.type).toBe("json_schema");
    expect(requests[0]!.body.response_format.json_schema.name).toBe(
      "surface_test",
    );
    expect(requests[0]!.body.stream).toBeUndefined();
    expect(activeModelRequests()).toBe(0);
  });

  test("applies the selected reasoning effort to provider requests", async () => {
    respond = () => textResponse('{"text":"Hello"}');
    updateRuntimeSettings({ model: "selected-model", reasoning: "high" });
    await generateObject({
      schema: z.object({ text: z.string() }),
      name: "surface_test",
      instructions: "Return JSON",
      input: {},
      maxOutputTokens: 100,
      feature: "test",
    });
    expect(requests[0]!.body.model).toBe("selected-model");
    expect(requests[0]!.body.reasoning_effort).toBe("high");
  });

  test("rejects a missing key before reaching the provider", async () => {
    updateRuntimeSettings({ apiKey: "" });
    resetAiProviderCache();
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
      }),
    ).rejects.toMatchObject({ kind: "unconfigured" });
    expect(requests).toHaveLength(0);
  });

  test("maps provider and incomplete responses to stable errors", async () => {
    respond = () => new Response("rate limited", { status: 429 });
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
        retries: 0,
      }),
    ).rejects.toMatchObject({ kind: "rate-limit" });

    respond = () => textResponse('{"ok":true}', "length");
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
      }),
    ).rejects.toMatchObject({ kind: "incomplete" });

    respond = () => textResponse("not json");
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
      }),
    ).rejects.toBeInstanceOf(AiError);
  });

  test("surfaces a provider workload rejection without retrying", async () => {
    respond = () =>
      new Response(
        JSON.stringify({
          error: {
            message:
              "Request is missing x-opencode-session and cannot be routed efficiently.",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
      }),
    ).rejects.toMatchObject({ kind: "workload", retryable: false });
    expect(requests).toHaveLength(1);
  });

  test("propagates an abort signal", async () => {
    const controller = new AbortController();
    respond = () =>
      new Response("ignored", { status: 400, statusText: "ignored" });
    globalThis.fetch = (async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: "aborted" });
    globalThis.fetch = mockFetch;
  });

  test("streams partial structured values and returns the final output", async () => {
    respond = () => sse(['{"text":"Hel', 'lo world"}']);
    const partials: string[] = [];
    const result = await streamObject({
      schema: z.object({ text: z.string() }).strict(),
      name: "surface_test",
      instructions: "Return JSON",
      input: {},
      maxOutputTokens: 100,
      feature: "test",
      onPartial: (partial) => {
        if (typeof partial.text === "string") partials.push(partial.text);
      },
    });
    expect(result.output.text).toBe("Hello world");
    expect(partials.at(-1)).toBe("Hello world");
    expect(requests[0]!.body.stream).toBe(true);
  });

  test("plain text generation is bounded and normalized", async () => {
    respond = () => textResponse("Corrected answer");
    const result = await generateTextResult({
      instructions: "Repair",
      messages: [{ role: "user", content: "Answer" }],
      maxOutputTokens: 100,
      feature: "test",
    });
    expect(result.text).toBe("Corrected answer");
    expect(result.model).toBe("server-model");
  });

  test("rejects an oversized provider response", async () => {
    respond = () =>
      new Response("{}", {
        headers: { "content-length": "3000000" },
      });
    await expect(
      generateObject({
        schema: z.object({ ok: z.boolean() }),
        name: "surface_test",
        instructions: "Test",
        input: {},
        maxOutputTokens: 10,
        feature: "test",
        retries: 0,
      }),
    ).rejects.toMatchObject({ kind: "invalid-output" });
  });
});
