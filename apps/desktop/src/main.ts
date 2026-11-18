import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { desktopIdentity } from "./channel";
import { createLogSink, type LogSink } from "./logger";
import { desktopPaths, type DesktopPaths } from "./paths";
import { getFreePort } from "./ports";
import { startAndWait, type ManagedProcess } from "./processes";

const identity = desktopIdentity();

// Development builds use a separate application name, so Electron derives a
// separate userData directory and both channels can coexist on one machine.
app.setName(identity.appName);
if (process.env.SURFACE_DESKTOP_USER_DATA) {
  app.setPath("userData", resolve(process.env.SURFACE_DESKTOP_USER_DATA));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    void shutdown(0);
  });
  process.on("uncaughtException", (error) => {
    void fatal("Unexpected application error", error);
  });
  process.on("unhandledRejection", (error) => {
    void fatal("Unexpected application error", error);
  });
  void app.whenReady().then(bootstrap);
}

let mainWindow: BrowserWindow | null = null;
let backend: ManagedProcess | null = null;
let mainLog: LogSink | null = null;
let paths: DesktopPaths | null = null;
let backendUrl = "";
let desktopToken = "";
let shuttingDown = false;
let shutdownComplete = false;
let running = false;

const zoomStep = 0.5;
const minimumZoomLevel = -3;
const maximumZoomLevel = 4;

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null);
  paths = desktopPaths();
  mkdirSync(paths.data, { recursive: true, mode: 0o700 });
  mkdirSync(paths.logs, { recursive: true, mode: 0o700 });
  mainLog = createLogSink(paths.logs, "desktop.log", { echo: true });
  const startupLog = mainLog;
  startupLog.write(
    `[${new Date().toISOString()}] ${identity.productName} ${app.getVersion()} starting (channel=${identity.channel}, electron ${process.versions.electron}, node ${process.versions.node}, packaged=${app.isPackaged})`,
  );
  startupLog.write(`userData=${paths.root}`);
  startupLog.write(`sqlite=${paths.database}`);
  try {
    const backendPort =
      Number(process.env.SURFACE_DESKTOP_BACKEND_PORT) || (await getFreePort());
    desktopToken = randomBytes(32).toString("base64url");
    backendUrl = `http://127.0.0.1:${backendPort}`;

    const backendLog = createLogSink(paths.logs, "backend.log");
    backend = await startAndWait(
      {
        name: "backend",
        entry: paths.backendEntry,
        log: backendLog,
        env: {
          ...process.env,
          APP_ENV: "production",
          NODE_ENV: "production",
          HOST: "127.0.0.1",
          PORT: String(backendPort),
          SQLITE_DATABASE_FILE: paths.database,
          DATA_DIR: paths.data,
          WEB_DIST_DIR: paths.web,
          LOCATIONS_DATA_FILE: join("..", "data", "locations.json.gz"),
          SURFACE_DESKTOP_TOKEN: desktopToken,
        },
        onUnexpectedExit: (name, code) => {
          if (running) void childFailed(name, code);
        },
      },
      `${backendUrl}/api/health`,
      90_000,
    );

    await setDesktopCookie();
    registerIpc();
    createWindow();
    running = true;
    startupLog.write(
      `[${new Date().toISOString()}] ${identity.productName} ready at ${backendUrl}`,
    );
  } catch (error) {
    await fatal(`${identity.productName} could not start`, error);
  }
}

function changeZoom(delta: number): void {
  const contents = mainWindow?.webContents;
  if (!contents) return;
  const nextLevel = Math.min(
    maximumZoomLevel,
    Math.max(minimumZoomLevel, contents.getZoomLevel() + delta),
  );
  contents.setZoomLevel(nextLevel);
}

function resetZoom(): void {
  mainWindow?.webContents.setZoomLevel(0);
}

function createWindow(): void {
  const preload = join(__dirname, "preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0d10",
    show: false,
    title: identity.productName,
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(app.getAppPath(), "resources", "icon.png"),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  mainWindow.maximize();
  mainWindow.on("maximize", () => publishWindowState());
  mainWindow.on("unmaximize", () => publishWindowState());
  mainWindow.on("enter-full-screen", () => publishWindowState());
  mainWindow.on("leave-full-screen", () => publishWindowState());
  mainWindow.on("focus", () => publishWindowState());
  mainWindow.on("blur", () => publishWindowState());
  mainWindow.webContents.on("did-finish-load", () => publishWindowState());
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !mainWindow) return;
    if (input.key === "F11") {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      publishWindowState();
      return;
    }
    if ((input.control || input.meta) && !input.alt) {
      if (
        input.key === "+" ||
        input.key === "=" ||
        input.code === "NumpadAdd"
      ) {
        event.preventDefault();
        changeZoom(zoomStep);
        return;
      }
      if (
        input.key === "-" ||
        input.key === "_" ||
        input.code === "NumpadSubtract"
      ) {
        event.preventDefault();
        changeZoom(-zoomStep);
        return;
      }
      if (input.key === "0" || input.code === "Numpad0") {
        event.preventDefault();
        resetZoom();
        return;
      }
    }
    if (!input.alt) return;
    if (input.key === "F9") {
      event.preventDefault();
      mainWindow.minimize();
    } else if (input.key === "F10") {
      event.preventDefault();
      toggleMaximize();
    }
  });
  const rendererOrigin = process.env.SURFACE_DESKTOP_RENDERER_URL
    ? new URL(process.env.SURFACE_DESKTOP_RENDERER_URL).origin
    : null;
  const allowedOrigins = new Set([
    new URL(backendUrl).origin,
    ...(rendererOrigin ? [rendererOrigin] : []),
  ]);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      event.preventDefault();
      return;
    }
    if (!allowedOrigins.has(target.origin)) {
      event.preventDefault();
      if (/^https?:$/i.test(target.protocol)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    mainLog?.write(
      `[${new Date().toISOString()}] renderer gone reason=${details.reason} code=${details.exitCode}`,
    );
  });
  mainWindow.webContents.on("console-message", (event) => {
    const details = event as unknown as {
      level?: string;
      message?: string;
    };
    if (
      details.message &&
      (details.level === "warning" || details.level === "error")
    ) {
      mainLog?.write(`[renderer:${details.level}] ${details.message}`);
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  const rendererUrl = process.env.SURFACE_DESKTOP_RENDERER_URL ?? backendUrl;
  void mainWindow.loadURL(`${rendererUrl}/`).catch(async (error) => {
    await fatal(`${identity.productName} could not open its interface`, error);
  });

}

async function setDesktopCookie(): Promise<void> {
  const cookieOrigin = process.env.SURFACE_DESKTOP_RENDERER_URL ?? backendUrl;
  await session.defaultSession.cookies.set({
    url: cookieOrigin,
    name: "surface_desktop_token",
    value: desktopToken,
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function registerIpc(): void {
  ipcMain.handle("desktop:app:info", (event) => {
    assertTrustedSender(event);
    return {
      version: app.getVersion(),
      channel: identity.channel,
      packaged: app.isPackaged,
      dataDir: paths?.data ?? "",
      logsDir: paths?.logs ?? "",
      database: "SQLite",
    };
  });
  ipcMain.handle("desktop:open-data", async (event) => {
    assertTrustedSender(event);
    if (paths) await shell.openPath(paths.data);
  });
  ipcMain.handle("desktop:window:get-state", (event) => {
    assertTrustedSender(event);
    return windowState();
  });
  ipcMain.handle("desktop:window:minimize", (event) => {
    assertTrustedSender(event);
    mainWindow?.minimize();
  });
  ipcMain.handle("desktop:window:toggle-maximize", (event) => {
    assertTrustedSender(event);
    toggleMaximize();
    return windowState();
  });
  ipcMain.handle("desktop:window:close", (event) => {
    assertTrustedSender(event);
    mainWindow?.close();
  });
}

function windowState(): {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
} {
  return {
    maximized: mainWindow?.isMaximized() ?? false,
    fullscreen: mainWindow?.isFullScreen() ?? false,
    focused: mainWindow?.isFocused() ?? false,
  };
}

function publishWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:window-state", windowState());
}

function toggleMaximize(): void {
  if (!mainWindow) return;
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  publishWindowState();
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) throw new Error("Untrusted desktop IPC sender.");
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error("Untrusted desktop IPC sender.");
  }
  const trustedOrigins = new Set([
    new URL(backendUrl).origin,
    ...(process.env.SURFACE_DESKTOP_RENDERER_URL
      ? [new URL(process.env.SURFACE_DESKTOP_RENDERER_URL).origin]
      : []),
  ]);
  const origin = new URL(frameUrl).origin;
  if (!trustedOrigins.has(origin)) {
    throw new Error("Untrusted desktop IPC sender.");
  }
}

async function childFailed(name: string, code: number | null): Promise<void> {
  if (shuttingDown) return;
  const message = `${name} stopped unexpectedly (exit ${code ?? "unknown"}). See ${paths?.logs ?? "the log directory"}.`;
  mainLog?.write(`[${new Date().toISOString()}] ${message}`);
  await fatal(`${identity.productName} stopped`, new Error(message));
}

async function fatal(title: string, error: unknown): Promise<void> {
  if (shuttingDown) return;
  const message = error instanceof Error ? error.message : String(error);
  mainLog?.write(`[${new Date().toISOString()}] FATAL ${title}: ${message}`);
  if (app.isReady()) {
    dialog.showErrorBox(title, `${message}\n\nLogs: ${paths?.logs ?? ""}`);
  }
  await shutdown(1, true);
}

function delay(ms: number): Promise<void> {
  return new Promise((settle) => setTimeout(settle, ms));
}

async function shutdown(exitCode: number, force = false): Promise<void> {
  if (shuttingDown) {
    if (force) app.exit(exitCode);
    return;
  }
  shuttingDown = true;
  running = false;
  mainLog?.write(`[${new Date().toISOString()}] shutdown requested`);
  try {
    await backend?.stop();
  } catch (error) {
    mainLog?.write(
      `[${new Date().toISOString()}] shutdown error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  mainLog?.write(`[${new Date().toISOString()}] shutdown complete`);
  mainLog?.close();
  shutdownComplete = true;
  app.exit(exitCode);
}
