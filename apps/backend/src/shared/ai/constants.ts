export const SUPPORTED_AI_PROVIDERS = ["opencode-go"] as const;

export type SupportedAiProvider = (typeof SUPPORTED_AI_PROVIDERS)[number];

export const DEFAULT_AI_PROVIDER: SupportedAiProvider = "opencode-go";
export const DEFAULT_AI_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
export const DEFAULT_AI_MODEL = "deepseek-v4.1-flash";
