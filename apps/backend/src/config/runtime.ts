import { env } from "./env";

export interface RuntimeSettings {
  searxngBaseUrl: string;
  omnirouteBaseUrl: string;
  omnirouteApiKey: string;
  omnirouteModel: string;
}

const runtime: RuntimeSettings = {
  searxngBaseUrl: env.SEARXNG_BASE_URL,
  omnirouteBaseUrl: env.OMNIROUTE_BASE_URL,
  omnirouteApiKey: env.OMNIROUTE_API_KEY ?? "",
  omnirouteModel: env.OMNIROUTE_MODEL,
};

export function getRuntimeSettings(): Readonly<RuntimeSettings> {
  return runtime;
}

export function updateRuntimeSettings(
  input: Partial<RuntimeSettings>,
): Readonly<RuntimeSettings> {
  if (input.searxngBaseUrl !== undefined) {
    runtime.searxngBaseUrl = normalizeUrl(input.searxngBaseUrl);
  }
  if (input.omnirouteBaseUrl !== undefined) {
    runtime.omnirouteBaseUrl = normalizeUrl(input.omnirouteBaseUrl);
  }
  if (input.omnirouteApiKey !== undefined) {
    runtime.omnirouteApiKey = input.omnirouteApiKey.trim();
  }
  if (input.omnirouteModel !== undefined) {
    runtime.omnirouteModel =
      input.omnirouteModel.trim() || runtime.omnirouteModel;
  }
  return runtime;
}

function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Service URLs must use http or https.");
  }
  return url.toString().replace(/\/$/, "");
}
