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

export interface DesktopSettingsInput {
  searxngUrl: string;
  omnirouteUrl: string;
  omnirouteModel: string;
  omnirouteApiKey?: string;
  clearOmniRouteKey?: boolean;
}

export interface DesktopSettingsSnapshot {
  searxngUrl: string;
  omnirouteUrl: string;
  omnirouteModel: string;
  hasOmniRouteKey: boolean;
  secretStorage: SecretStorage;
}

export type SecretStorage =
  | "os-encrypted"
  | "basic-text"
  | "plaintext"
  | "unavailable";

interface StoredSettings {
  version: 1;
  searxngUrl: string;
  omnirouteUrl: string;
  omnirouteModel: string;
  apiKey?:
    | { scheme: "safeStorage"; value: string }
    | { scheme: "plaintext"; value: string };
}

export class SettingsStore {
  private stored: StoredSettings;
  private apiKey: string;
  private secretStorage: SecretStorage;

  private constructor(
    private readonly file: string,
    stored: StoredSettings,
    apiKey: string,
    secretStorage: SecretStorage,
  ) {
    this.stored = stored;
    this.apiKey = apiKey;
    this.secretStorage = secretStorage;
  }

  static async create(file: string): Promise<SettingsStore> {
    const stored = readStored(file);
    const apiKey = await decryptKey(stored, file);
    const secretStorage = await storageBackend(stored);
    return new SettingsStore(file, stored, apiKey, secretStorage);
  }

  snapshot(): DesktopSettingsSnapshot {
    return {
      searxngUrl: this.stored.searxngUrl,
      omnirouteUrl: this.stored.omnirouteUrl,
      omnirouteModel: this.stored.omnirouteModel,
      hasOmniRouteKey: Boolean(this.apiKey),
      secretStorage: this.secretStorage,
    };
  }

  runtime(): DesktopSettingsSnapshot & { omnirouteApiKey: string } {
    return {
      ...this.snapshot(),
      omnirouteApiKey: this.apiKey,
    };
  }

  async save(input: DesktopSettingsInput): Promise<DesktopSettingsSnapshot> {
    validateUrl(input.searxngUrl, "SearXNG URL");
    validateUrl(input.omnirouteUrl, "OmniRoute URL");
    const model = input.omnirouteModel.trim();
    if (!model) throw new Error("OmniRoute model is required.");
    if (input.clearOmniRouteKey) this.apiKey = "";
    if (input.omnirouteApiKey?.trim()) {
      this.apiKey = input.omnirouteApiKey.trim();
    }
    this.stored = {
      version: 1,
      searxngUrl: normalizeUrl(input.searxngUrl),
      omnirouteUrl: normalizeUrl(input.omnirouteUrl),
      omnirouteModel: model,
      ...(this.apiKey ? { apiKey: await encryptKey(this.apiKey) } : {}),
    };
    this.secretStorage = await storageBackend(this.stored);
    writeStored(this.file, this.stored);
    return this.snapshot();
  }
}

function readStored(file: string): StoredSettings {
  if (!existsSync(file)) {
    return {
      version: 1,
      searxngUrl: "http://127.0.0.1:8080",
      omnirouteUrl: "http://127.0.0.1:20128/v1",
      omnirouteModel: "auto",
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as StoredSettings;
    if (
      parsed.version !== 1 ||
      typeof parsed.searxngUrl !== "string" ||
      typeof parsed.omnirouteUrl !== "string" ||
      typeof parsed.omnirouteModel !== "string"
    ) {
      throw new Error("unsupported settings format");
    }
    validateUrl(parsed.searxngUrl, "SearXNG URL");
    validateUrl(parsed.omnirouteUrl, "OmniRoute URL");
    return parsed;
  } catch (error) {
    throw new Error(
      `Cannot read desktop settings at ${file}: ${error instanceof Error ? error.message : "invalid file"}. Move the file aside to reset settings; the database and snapshots are not affected.`,
      { cause: error },
    );
  }
}

function writeStored(file: string, settings: StoredSettings): void {
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

async function encryptKey(
  value: string,
): Promise<StoredSettings["apiKey"]> {
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    return {
      scheme: "safeStorage",
      value: (await safeStorage.encryptStringAsync(value)).toString("base64"),
    };
  }
  return { scheme: "plaintext", value };
}

async function decryptKey(
  stored: StoredSettings,
  file: string,
): Promise<string> {
  if (!stored.apiKey) return "";
  if (stored.apiKey.scheme === "plaintext") return stored.apiKey.value;
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error(
      `The OmniRoute API key in ${file} is encrypted with the OS keychain, but secure storage is unavailable now. Unlock your keyring and restart Surface.`,
    );
  }
  try {
    const decrypted = await safeStorage.decryptStringAsync(
      Buffer.from(stored.apiKey.value, "base64"),
    );
    return decrypted.result;
  } catch {
    throw new Error(
      `Cannot decrypt the OmniRoute API key in ${file}. The OS keychain may have changed; save the key again in Settings.`,
    );
  }
}

async function storageBackend(
  stored: StoredSettings,
): Promise<SecretStorage> {
  if (!stored.apiKey) {
    return (await safeStorage.isAsyncEncryptionAvailable())
      ? selectedBackend()
      : "unavailable";
  }
  if (stored.apiKey.scheme === "plaintext") return "plaintext";
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
