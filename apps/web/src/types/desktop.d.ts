export interface SurfaceWindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

export interface SurfaceDesktopApi {
  gmailStatus(): Promise<{
    email: string | null;
    connectionType: "oauth" | null;
    available: boolean;
    error: string | null;
  }>;
  connectGmail(): Promise<{
    email: string | null;
    connectionType: "oauth" | null;
    available: boolean;
    error: string | null;
  }>;
  disconnectGmail(): Promise<{
    email: string | null;
    connectionType: "oauth" | null;
    available: boolean;
    error: string | null;
  }>;
  saveGmailDraft(
    draft: {
      id: string;
      to: string;
      subject: string;
      body: string;
      updatedAt: string;
    },
    confirmedEmail: string,
  ): Promise<{ email: string; savedRevision: string }>;
  getSettings(): Promise<DesktopSettingsSnapshot>;
  saveSettings(input: DesktopSettingsInput): Promise<{
    settings: DesktopSettingsSnapshot;
    applied: { ok: boolean; error: string | null };
  }>;
  appInfo(): Promise<{
    version: string;
    channel: "development" | "production";
    packaged: boolean;
    dataDir: string;
    logsDir: string;
    database: string;
  }>;
  openDataDir(): Promise<void>;
  getWindowState(): Promise<SurfaceWindowState>;
  minimizeWindow(): Promise<void>;
  toggleMaximize(): Promise<SurfaceWindowState>;
  closeWindow(): Promise<void>;
  onWindowState(listener: (state: SurfaceWindowState) => void): () => void;
}

export interface DesktopSettingsSnapshot {
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiReasoning: "default" | "low" | "medium" | "high";
  hasAiApiKey: boolean;
  legacyOmniRouteConfigured: boolean;
  secretStorage: "os-encrypted" | "basic-text" | "plaintext" | "unavailable";
}

export interface DesktopSettingsInput {
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiReasoning: "default" | "low" | "medium" | "high";
  aiApiKey?: string;
  clearAiApiKey?: boolean;
}

declare global {
  interface Window {
    surfaceDesktop?: SurfaceDesktopApi;
  }
}
