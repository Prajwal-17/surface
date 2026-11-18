import { app, safeStorage } from "electron";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_AI_PROVIDER = "opencode-go";
export const DEFAULT_AI_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
export const DEFAULT_AI_MODEL = "deepseek-v4.1-flash";

export interface DesktopSettingsInput {
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiReasoning: "default" | "low" | "medium" | "high";
  aiApiKey?: string;
  clearAiApiKey?: boolean;
}

export interface DesktopSettingsSnapshot {
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiReasoning: "default" | "low" | "medium" | "high";
  hasAiApiKey: boolean;
  legacyOmniRouteConfigured: boolean;
  secretStorage: SecretStorage;
}

export type SecretStorage =
  "os-encrypted" | "basic-text" | "plaintext" | "unavailable";

type StoredKey =
  | { scheme: "safeStorage"; value: string }
  | { scheme: "plaintext"; value: string };

interface StoredSettingsV2 {
  version: 2;
  searxngUrl: string;
  crawlerUrl?: string;
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiReasoning: "default" | "low" | "medium" | "high";
  apiKey?: StoredKey;
  /** Old OmniRoute credentials are retained but never used for AI calls. */
  legacyOmniRoute?: {
    baseUrl: string;
    model: string;
    apiKey?: StoredKey;
  };
}

interface StoredSettingsV3 {
  version: 3;
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiReasoning: "default" | "low" | "medium" | "high";
  apiKey?: StoredKey;
  legacyOmniRoute?: StoredSettingsV2["legacyOmniRoute"];
}

interface StoredSettingsV1 {
  version: 1;
  searxngUrl?: string;
  omnirouteUrl: string;
  omnirouteModel: string;
  apiKey?: StoredKey;
}

export class SettingsStore {
  private stored: StoredSettingsV3;
  private apiKey: string;
  private secretStorage: SecretStorage;

  private constructor(
    private readonly file: string,
    stored: StoredSettingsV3,
    apiKey: string,
    secretStorage: SecretStorage,
  ) {
    this.stored = stored;
    this.apiKey = apiKey;
    this.secretStorage = secretStorage;
  }

  static async create(file: string): Promise<SettingsStore> {
    const stored = readStored(file);
    const apiKey = await decryptKey(stored.apiKey, file);
    const secretStorage = await storageBackend(stored);
    return new SettingsStore(file, stored, apiKey, secretStorage);
  }

  snapshot(): DesktopSettingsSnapshot {
    return {
      aiProvider: this.stored.aiProvider,
      aiBaseUrl: this.stored.aiBaseUrl,
      aiModel: this.stored.aiModel,
      aiReasoning: this.stored.aiReasoning ?? "default",
      hasAiApiKey: Boolean(this.apiKey),
      legacyOmniRouteConfigured: Boolean(this.stored.legacyOmniRoute?.apiKey),
      secretStorage: this.secretStorage,
    };
  }

  runtime(): DesktopSettingsSnapshot & { aiApiKey: string } {
    return {
      ...this.snapshot(),
      aiApiKey: this.apiKey,
    };
  }

  async save(input: DesktopSettingsInput): Promise<DesktopSettingsSnapshot> {
    validateUrl(input.aiBaseUrl, "AI base URL");
    const provider = input.aiProvider.trim().toLowerCase();
    if (!provider) throw new Error("AI provider is required.");
    if (provider !== DEFAULT_AI_PROVIDER)
      throw new Error(
        `Unsupported AI provider "${input.aiProvider}". Use ${DEFAULT_AI_PROVIDER}.`,
      );
    const model = input.aiModel.trim();
    if (!model) throw new Error("AI model is required.");
    if (!["default", "low", "medium", "high"].includes(input.aiReasoning))
      throw new Error("Invalid reasoning effort.");
    const nextKey = input.clearAiApiKey
      ? ""
      : input.aiApiKey?.trim() || this.apiKey;
    const nextStored: StoredSettingsV3 = {
      version: 3,
      ...(this.stored.legacyOmniRoute
        ? { legacyOmniRoute: this.stored.legacyOmniRoute }
        : {}),
      aiProvider: provider,
      aiBaseUrl: normalizeUrl(input.aiBaseUrl),
      aiModel: model,
      aiReasoning: input.aiReasoning,
      ...(nextKey ? { apiKey: await encryptKey(nextKey) } : {}),
    };
    if (!nextKey) delete nextStored.apiKey;
    const nextStorage = await storageBackend(nextStored);
    writeStored(this.file, nextStored);
    this.stored = nextStored;
    this.apiKey = nextKey;
    this.secretStorage = nextStorage;
    return this.snapshot();
  }
}

function readStored(file: string): StoredSettingsV3 {
  if (!existsSync(file)) {
    return {
      version: 3,
      aiProvider: DEFAULT_AI_PROVIDER,
      aiBaseUrl: DEFAULT_AI_BASE_URL,
      aiModel: DEFAULT_AI_MODEL,
      aiReasoning: "default",
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as
      StoredSettingsV1 | StoredSettingsV2 | StoredSettingsV3;
    if (parsed.version === 1) {
      validateUrl(parsed.omnirouteUrl, "OmniRoute URL");
      if (typeof parsed.omnirouteModel !== "string")
        throw new Error("unsupported settings format");
      backupVersionOne(file, parsed);
      return {
        version: 3,
        aiProvider: DEFAULT_AI_PROVIDER,
        aiBaseUrl: DEFAULT_AI_BASE_URL,
        aiModel: DEFAULT_AI_MODEL,
        aiReasoning: "default",
        legacyOmniRoute: {
          baseUrl: parsed.omnirouteUrl,
          model: parsed.omnirouteModel,
          ...(parsed.apiKey ? { apiKey: parsed.apiKey } : {}),
        },
      };
    }
    if (
      (parsed.version !== 2 && parsed.version !== 3) ||
      typeof parsed.aiProvider !== "string" ||
      typeof parsed.aiBaseUrl !== "string" ||
      typeof parsed.aiModel !== "string"
    ) {
      throw new Error("unsupported settings format");
    }
    validateUrl(parsed.aiBaseUrl, "AI base URL");
    if (parsed.aiProvider !== DEFAULT_AI_PROVIDER)
      throw new Error(
        `Unsupported AI provider "${parsed.aiProvider}". Use ${DEFAULT_AI_PROVIDER}.`,
      );
    if (
      parsed.aiReasoning !== undefined &&
      !["default", "low", "medium", "high"].includes(parsed.aiReasoning)
    )
      throw new Error("Invalid reasoning effort.");
    return {
      version: 3,
      aiProvider: parsed.aiProvider,
      aiBaseUrl: parsed.aiBaseUrl,
      aiModel: parsed.aiModel,
      aiReasoning: parsed.aiReasoning ?? "default",
      ...(parsed.apiKey ? { apiKey: parsed.apiKey } : {}),
      ...(parsed.legacyOmniRoute
        ? { legacyOmniRoute: parsed.legacyOmniRoute }
        : {}),
    };
  } catch (error) {
    throw new Error(
      `Cannot read desktop settings at ${file}: ${error instanceof Error ? error.message : "invalid file"}. Move the file aside to reset settings; the database and snapshots are not affected.`,
      { cause: error },
    );
  }
}

function backupVersionOne(file: string, parsed: StoredSettingsV1): void {
  const backup = `${file}.v1.backup.json`;
  if (existsSync(backup)) return;
  try {
    writeFileSync(backup, JSON.stringify(parsed, null, 2), { mode: 0o600 });
    try {
      chmodSync(backup, 0o600);
    } catch {
      // Windows and some filesystems do not implement POSIX modes.
    }
  } catch (error) {
    throw new Error(
      `Cannot back up version-1 desktop settings before migration: ${error instanceof Error ? error.message : "write failed"}`,
      { cause: error },
    );
  }
}

function writeStored(file: string, settings: StoredSettingsV3): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
  renameSync(temporary, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows and some filesystems do not implement POSIX modes.
  }
}

async function encryptKey(value: string): Promise<StoredKey> {
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    return {
      scheme: "safeStorage",
      value: (await safeStorage.encryptStringAsync(value)).toString("base64"),
    };
  }
  return { scheme: "plaintext", value };
}

async function decryptKey(
  stored: StoredKey | undefined,
  file: string,
): Promise<string> {
  if (!stored) return "";
  if (stored.scheme === "plaintext") return stored.value;
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error(
      `The AI API key in ${file} is encrypted with the OS keychain, but secure storage is unavailable now. Unlock your keyring and restart ${app.getName()}.`,
    );
  }
  try {
    const decrypted = await safeStorage.decryptStringAsync(
      Buffer.from(stored.value, "base64"),
    );
    return decrypted.result;
  } catch {
    throw new Error(
      `Cannot decrypt the AI API key in ${file}. The OS keychain may have changed; save the key again in Settings.`,
    );
  }
}

async function storageBackend(
  stored: StoredSettingsV2 | StoredSettingsV3,
): Promise<SecretStorage> {
  const key = stored.apiKey ?? stored.legacyOmniRoute?.apiKey;
  if (!key) {
    return (await safeStorage.isAsyncEncryptionAvailable())
      ? selectedBackend()
      : "unavailable";
  }
  if (key.scheme === "plaintext") return "plaintext";
  return selectedBackend();
}

async function selectedBackend(): Promise<SecretStorage> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return "unavailable";
  const backend = safeStorage.getSelectedStorageBackend();
  if (backend === "basic_text") return "basic-text";
  return "os-encrypted";
}

function validateUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function settingsFile(): string {
  return `${app.getPath("userData")}/settings.json`;
}
