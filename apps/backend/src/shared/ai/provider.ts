import type { LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  aiConfigured,
  getAiSettings,
  type AiRuntimeSettings,
} from "../../config/runtime";
import { AiError } from "./errors";

type Provider = ReturnType<typeof createOpenAICompatible>;

const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;

/** Bound provider transports without reimplementing their protocol. */
const boundedFetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const response = await fetch(input, init);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_RESPONSE_BYTES)
    throw new AiError(
      "invalid-output",
      "The AI provider response exceeds the size limit.",
    );
  if (!response.body) return response;
  let size = 0;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > MAX_PROVIDER_RESPONSE_BYTES) {
          controller.error(
            new AiError(
              "invalid-output",
              "The AI provider response exceeds the size limit.",
            ),
          );
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}) as unknown as typeof fetch;

let cached: { key: string; provider: Provider } | null = null;

/**
 * Build one provider instance per configuration snapshot. Every SDK call is
 * passed the returned model explicitly, so a settings change applies to the
 * next call while an in-flight call keeps its original snapshot.
 */
export function aiModel(
  settings: Readonly<AiRuntimeSettings> = getAiSettings(),
): LanguageModel {
  assertAiConfigured(settings);
  const key = `${settings.provider}\n${settings.baseUrl}\n${settings.apiKey}`;
  if (cached?.key !== key) {
    cached = {
      key,
      provider: createOpenAICompatible({
        name: settings.provider,
        baseURL: settings.baseUrl,
        apiKey: settings.apiKey,
        includeUsage: true,
        supportsStructuredOutputs: true,
        fetch: boundedFetch,
      }),
    };
  }
  return cached.provider(settings.model);
}

export function assertAiConfigured(
  settings: Readonly<AiRuntimeSettings> = getAiSettings(),
): void {
  if (!aiConfigured(settings))
    throw new AiError(
      "unconfigured",
      "AI is not configured. Add an OpenCode Go API key in Settings.",
    );
}

/** Test seam: drop the cached provider after changing mocked transport/config. */
export function resetAiProviderCache() {
  cached = null;
}
