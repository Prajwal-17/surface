// oxlint-disable-next-line unicorn/require-module-specifiers -- make this file a module for declare global
export {};

interface DesktopSettingsSnapshot {
  searxngUrl: string;
  omnirouteUrl: string;
  omnirouteModel: string;
  hasOmniRouteKey: boolean;
  secretStorage: "os-encrypted" | "basic-text" | "plaintext" | "unavailable";
}

interface DesktopSettingsInput {
  searxngUrl: string;
  omnirouteUrl: string;
  omnirouteModel: string;
  omnirouteApiKey?: string;
  clearOmniRouteKey?: boolean;
}

interface SurfaceWindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

interface SurfaceDesktopApi {
  getSettings(): Promise<DesktopSettingsSnapshot>;
  saveSettings(input: DesktopSettingsInput): Promise<{
    settings: DesktopSettingsSnapshot;
    applied: { ok: boolean; error: string | null };
  }>;
  appInfo(): Promise<{
    version: string;
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

declare global {
  interface Window {
    surfaceDesktop?: SurfaceDesktopApi;
  }
}
