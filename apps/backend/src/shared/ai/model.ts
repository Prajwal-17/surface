import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { aiConfigured, getRuntimeSettings } from "../../config/runtime";
import { HttpError } from "../errors/http-error";

export function getWritingModel(conversationId?: string) {
  return getConfiguredModel(conversationId);
}

/**
 * Lead discovery uses the same OpenAI-compatible provider. The run ID acts as
 * the stable request/session key, mirroring writing conversations.
 */
export function getAgentModel(runId: string) {
  return getConfiguredModel(runId);
}

function getConfiguredModel(conversationId?: string) {
  const settings = { ...getRuntimeSettings() };
  if (!aiConfigured(settings)) {
    throw new HttpError(
      503,
      "Connect an AI provider in Settings before generating a draft.",
    );
  }
  const provider = createOpenAICompatible({
    name: settings.provider,
    baseURL: settings.baseUrl,
    apiKey: settings.apiKey,
    // OpenCode Go uses this stable conversation key for request routing and
    // prompt caching. Do not use a per-turn ID here.
    headers:
      settings.provider === "opencode-go" && conversationId
        ? {
            "x-opencode-session": `ses_${conversationId.replaceAll("-", "")}`,
          }
        : undefined,
  });
  return { model: provider.chatModel(settings.model), settings };
}

export function reasoningProviderOptions(settings: {
  provider: string;
  reasoning: "default" | "low" | "medium" | "high";
}) {
  return settings.reasoning === "default"
    ? undefined
    : { [settings.provider]: { reasoningEffort: settings.reasoning } };
}
