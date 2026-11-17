import type { FinishReason, LanguageModelUsage } from "ai";
import {
  APICallError,
  JSONParseError,
  LoadAPIKeyError,
  LoadSettingError,
  NoContentGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";
import { z } from "zod";

export type AiErrorKind =
  | "unconfigured"
  | "busy"
  | "auth"
  | "rate-limit"
  | "provider"
  | "invalid-output"
  | "incomplete"
  | "aborted"
  | "timeout";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly retryable: boolean;

  constructor(
    kind: AiErrorKind,
    message: string,
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "AiError";
    this.kind = kind;
    this.retryable = options.retryable ?? false;
  }
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export function normalizeAiError(
  error: unknown,
  options: { aborted?: boolean; timedOut?: boolean } = {},
): AiError {
  if (error instanceof AiError) return error;
  if (RetryError.isInstance(error))
    return normalizeAiError(error.lastError, options);
  if (options.aborted)
    return new AiError("aborted", "The AI request was stopped.");
  if (options.timedOut)
    return new AiError(
      "timeout",
      "The AI request took too long. Try again or use a smaller input.",
      { cause: error },
    );
  if (isAbortError(error))
    return error instanceof Error && error.name === "TimeoutError"
      ? new AiError(
          "timeout",
          "The AI request took too long. Try again or use a smaller input.",
          { cause: error },
        )
      : new AiError("aborted", "The AI request was stopped.", { cause: error });
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403)
      return new AiError(
        "auth",
        "The AI provider rejected the API key. Check the OpenCode Go key in Settings.",
        { cause: error },
      );
    if (status === 429)
      return new AiError(
        "rate-limit",
        "The AI provider is rate limiting or out of allowance. Wait and try again.",
        { cause: error, retryable: true },
      );
    if (status !== undefined && status >= 500)
      return new AiError(
        "provider",
        `The AI provider is temporarily unavailable (HTTP ${status}). Try again shortly.`,
        { cause: error, retryable: true },
      );
    if (status !== undefined)
      return new AiError(
        "provider",
        `The AI provider rejected the request (HTTP ${status}). Check the model and input size.`,
        { cause: error },
      );
    return new AiError(
      "provider",
      "Could not reach the AI provider. Check the network connection and provider URL.",
      { cause: error, retryable: true },
    );
  }
  if (
    NoOutputGeneratedError.isInstance(error) ||
    NoContentGeneratedError.isInstance(error)
  )
    return new AiError(
      "invalid-output",
      "The AI response did not contain a complete result. Try again.",
      { cause: error },
    );
  if (
    TypeValidationError.isInstance(error) ||
    JSONParseError.isInstance(error) ||
    error instanceof z.ZodError
  )
    return new AiError(
      "invalid-output",
      "The AI returned an invalid result. Try again.",
      { cause: error },
    );
  if (LoadAPIKeyError.isInstance(error) || LoadSettingError.isInstance(error))
    return new AiError(
      "unconfigured",
      "AI is not configured. Add an OpenCode Go API key in Settings.",
      { cause: error },
    );
  return new AiError(
    "provider",
    error instanceof Error
      ? error.message
      : "The AI provider could not complete the request.",
    { cause: error },
  );
}

export function assertUsableFinish(
  finishReason: FinishReason,
  hint = "The AI response was incomplete. Try again.",
) {
  if (finishReason === "stop") return;
  if (finishReason === "length")
    throw new AiError(
      "incomplete",
      "The AI response reached its output limit before finishing. Try again.",
    );
  if (finishReason === "content-filter")
    throw new AiError(
      "invalid-output",
      "The AI provider blocked the response. Try a different input.",
    );
  if (finishReason === "tool-calls")
    throw new AiError(
      "incomplete",
      "The AI response ended while still requesting tools. Try again.",
    );
  throw new AiError("incomplete", hint);
}

export function describeUsage(usage: LanguageModelUsage | undefined) {
  if (!usage) return "tokens=unknown";
  return `tokens=${usage.inputTokens ?? "?"}in/${usage.outputTokens ?? "?"}out`;
}
