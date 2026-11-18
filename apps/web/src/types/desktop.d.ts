export {};

interface SurfaceWindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

interface SurfaceDesktopApi {
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

declare global {
  interface Window {
    surfaceDesktop?: SurfaceDesktopApi;
  }
}
