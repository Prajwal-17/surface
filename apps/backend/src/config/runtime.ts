import { env } from "./env";
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER,
  SUPPORTED_AI_PROVIDERS,
} from "../shared/ai/constants";

export interface AiRuntimeSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoning: "default" | "low" | "medium" | "high";
}

export type RuntimeSettings = AiRuntimeSettings;

const runtime: RuntimeSettings = {
  provider: env.AI_PROVIDER,
  baseUrl: env.AI_BASE_URL,
  apiKey: env.OPENCODE_GO_API_KEY ?? "",
  model: env.AI_MODEL,
  reasoning: env.AI_REASONING,
};

/** Immutable-by-convention snapshot. An active call keeps this exact object. */
export function getRuntimeSettings(): Readonly<RuntimeSettings> {
  return runtime;
}

export function getAiSettings(): Readonly<AiRuntimeSettings> {
  return {
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    model: runtime.model,
    reasoning: runtime.reasoning,
  };
}

export function aiConfigured(settings: Readonly<AiRuntimeSettings> = runtime) {
  return Boolean(
    settings.apiKey && settings.provider && settings.baseUrl && settings.model,
  );
}

export function updateRuntimeSettings(
  input: Partial<RuntimeSettings>,
): Readonly<RuntimeSettings> {
  if (input.provider !== undefined) {
    runtime.provider = normalizeProvider(input.provider);
  }
  if (input.baseUrl !== undefined) {
    runtime.baseUrl = normalizeUrl(input.baseUrl, "AI base URL");
  }
  if (input.model !== undefined) {
    runtime.model = normalizeModel(input.model);
  }
  if (input.reasoning !== undefined) {
    if (!["default", "low", "medium", "high"].includes(input.reasoning))
      throw new Error("Invalid reasoning effort.");
    runtime.reasoning = input.reasoning;
  }
  if (input.apiKey !== undefined) {
    runtime.apiKey = input.apiKey.trim();
  }
  return runtime;
}

export function normalizeProvider(value: string): string {
  const provider = value.trim().toLowerCase();
  if (!(SUPPORTED_AI_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(
      `Unsupported AI provider "${value}". Use ${SUPPORTED_AI_PROVIDERS.join(" or ")}.`,
    );
  }
  return provider;
}

export function normalizeModel(value: string): string {
  const model = value.trim();
  if (!model) throw new Error("AI model is required.");
  if (model.length > 200) throw new Error("AI model name is too long.");
  return model;
}

export function normalizeUrl(value: string, label = "Service URL"): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }
  return url.toString().replace(/\/$/, "");
}

export { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER };
