import {
  generateText,
  Output,
  streamText,
  type FinishReason,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import type { z } from "zod";
import { getAiSettings, type AiRuntimeSettings } from "../../config/runtime";
import { acquireModelSlot } from "./capacity";
import {
  AiError,
  assertUsableFinish,
  describeUsage,
  normalizeAiError,
} from "./errors";
import { aiModel, assertAiConfigured } from "./provider";

export interface AiResult<T> {
  output: T;
  model: string;
  finishReason: FinishReason;
  usage: LanguageModelUsage | undefined;
}

interface BaseGenerationOptions<T> {
  schema: z.ZodType<T>;
  name: string;
  description?: string;
  instructions: string;
  input: unknown;
  maxOutputTokens: number;
  feature: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  settings?: Readonly<AiRuntimeSettings>;
}

function abortContext(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("AI generation timed out."));
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function logGeneration(options: {
  feature: string;
  model: string;
  startedAt: number;
  finishReason?: FinishReason;
  usage?: LanguageModelUsage;
  failed?: boolean;
}) {
  const parts = [
    `feature=${options.feature}`,
    `model=${options.model}`,
    `durationMs=${Date.now() - options.startedAt}`,
  ];
  if (options.finishReason) parts.push(`finish=${options.finishReason}`);
  if (options.usage) parts.push(describeUsage(options.usage));
  if (options.failed) parts.push("status=failed");
  console.info(`[ai] ${parts.join(" ")}`);
}

export interface AiTextResult {
  text: string;
  model: string;
  finishReason: FinishReason;
  usage: LanguageModelUsage | undefined;
}

/** Plain-text generation used for bounded continuations such as citation repair. */
export async function generateTextResult(options: {
  instructions: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxOutputTokens: number;
  feature: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  settings?: Readonly<AiRuntimeSettings>;
}): Promise<AiTextResult> {
  const settings = options.settings ?? getAiSettings();
  assertAiConfigured(settings);
  const slot = acquireModelSlot();
  const startedAt = Date.now();
  const abort = abortContext(options.signal, options.timeoutMs ?? 120_000);
  let failed = true;
  try {
    const result = await generateText({
      model: aiModel(settings),
      instructions: options.instructions,
      ...(options.messages
        ? { messages: options.messages }
        : { prompt: options.prompt ?? "" }),
      maxOutputTokens: options.maxOutputTokens,
      maxRetries: options.retries ?? 0,
      abortSignal: abort.signal,
    });
    assertUsableFinish(result.finishReason);
    if (!result.text.trim())
      throw new AiError("invalid-output", "The AI returned an empty response.");
    failed = false;
    const model = result.response.modelId || settings.model;
    logGeneration({
      feature: options.feature,
      model,
      startedAt,
      finishReason: result.finishReason,
      usage: result.totalUsage,
    });
    return {
      text: result.text,
      model,
      finishReason: result.finishReason,
      usage: result.totalUsage,
    };
  } catch (error) {
    throw normalizeAiError(error, {
      aborted: Boolean(options.signal?.aborted),
      timedOut: abort.timedOut(),
    });
  } finally {
    abort.cleanup();
    slot.release();
    if (failed)
      logGeneration({
        feature: options.feature,
        model: settings.model,
        startedAt,
        failed: true,
      });
  }
}

export async function generateObject<T>(
  options: BaseGenerationOptions<T>,
): Promise<AiResult<T>> {
  const settings = options.settings ?? getAiSettings();
  assertAiConfigured(settings);
  const slot = acquireModelSlot();
  const startedAt = Date.now();
  const abort = abortContext(options.signal, options.timeoutMs ?? 120_000);
  let failed = true;
  try {
    const result = await generateText({
      model: aiModel(settings),
      instructions: options.instructions,
      prompt: JSON.stringify(options.input),
      output: Output.object({
        schema: options.schema,
        name: options.name,
        description: options.description,
      }),
      maxOutputTokens: options.maxOutputTokens,
      maxRetries: options.retries ?? 1,
      abortSignal: abort.signal,
    });
    assertUsableFinish(result.finishReason);
    const output = options.schema.parse(result.output);
    failed = false;
    const model = result.response.modelId || settings.model;
    logGeneration({
      feature: options.feature,
      model,
      startedAt,
      finishReason: result.finishReason,
      usage: result.totalUsage,
    });
    return {
      output,
      model,
      finishReason: result.finishReason,
      usage: result.totalUsage,
    };
  } catch (error) {
    throw normalizeAiError(error, {
      aborted: Boolean(options.signal?.aborted),
      timedOut: abort.timedOut(),
    });
  } finally {
    abort.cleanup();
    slot.release();
    if (failed)
      logGeneration({
        feature: options.feature,
        model: settings.model,
        startedAt,
        failed: true,
      });
  }
}

/**
 * Stream a structured object, exposing partial parsed values for live UI.
 * Completion means the final, schema-valid output was received.
 */
export async function streamObject<T>(
  options: BaseGenerationOptions<T> & {
    onPartial?: (value: Partial<T>) => void | Promise<void>;
  },
): Promise<AiResult<T>> {
  const settings = options.settings ?? getAiSettings();
  assertAiConfigured(settings);
  const slot = acquireModelSlot();
  const startedAt = Date.now();
  const abort = abortContext(options.signal, options.timeoutMs ?? 120_000);
  let failed = true;
  let streamError: unknown;
  try {
    const result = streamText({
      model: aiModel(settings),
      instructions: options.instructions,
      prompt: JSON.stringify(options.input),
      output: Output.object({
        schema: options.schema,
        name: options.name,
        description: options.description,
      }),
      maxOutputTokens: options.maxOutputTokens,
      maxRetries: 0,
      abortSignal: abort.signal,
      onError: ({ error }) => {
        streamError = error;
      },
    });
    if (options.onPartial)
      for await (const partial of result.partialOutputStream)
        await options.onPartial(partial as Partial<T>);
    const output = options.schema.parse(await result.output);
    if (streamError) throw streamError;
    const finishReason = await result.finishReason;
    assertUsableFinish(finishReason);
    failed = false;
    const model = (await result.finalStep).response.modelId || settings.model;
    logGeneration({
      feature: options.feature,
      model,
      startedAt,
      finishReason,
      usage: await result.totalUsage,
    });
    return {
      output,
      model,
      finishReason,
      usage: await result.totalUsage,
    };
  } catch (error) {
    throw normalizeAiError(error, {
      aborted: Boolean(options.signal?.aborted),
      timedOut: abort.timedOut(),
    });
  } finally {
    abort.cleanup();
    slot.release();
    if (failed)
      logGeneration({
        feature: options.feature,
        model: settings.model,
        startedAt,
        failed: true,
      });
  }
}
