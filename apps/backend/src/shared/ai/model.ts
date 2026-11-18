import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { aiConfigured, getRuntimeSettings } from "../../config/runtime";
import { HttpError } from "../errors/http-error";

export function getWritingModel(conversationId?: string) {
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
