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
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { desktopIdentity } from "./channel";
import { createLogSink, type LogSink } from "./logger";
import { desktopPaths, type DesktopPaths } from "./paths";
import { getFreePort } from "./ports";
import { startAndWait, type ManagedProcess } from "./processes";
import {
  SettingsStore,
  type DesktopSettingsInput,
  type DesktopSettingsSnapshot,
} from "./settings";

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
let crawler: ManagedProcess | null = null;
let mainLog: LogSink | null = null;
let paths: DesktopPaths | null = null;
let backendUrl = "";
let desktopToken = "";
let shuttingDown = false;
let shutdownComplete = false;
let running = false;

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
  if (existsSync(paths.legacyDatabase)) {
    startupLog.write(
      "legacy pglite/ directory found; it is not read, migrated, overwritten, or deleted",
    );
  }

  try {
    const settings = await SettingsStore.create(paths.settings);
    const selected = settings.runtime();
    startupLog.write(
      `settings loaded secretStorage=${selected.secretStorage} omnirouteConfigured=${Boolean(selected.omnirouteApiKey)}`,
    );

    const crawlerPort =
      Number(process.env.SURFACE_DESKTOP_CRAWLER_PORT) || (await getFreePort());
    let backendPort =
      Number(process.env.SURFACE_DESKTOP_BACKEND_PORT) || (await getFreePort());
    while (backendPort === crawlerPort) backendPort = await getFreePort();
    desktopToken = randomBytes(32).toString("base64url");
    const crawlerUrl = `http://127.0.0.1:${crawlerPort}`;
    backendUrl = `http://127.0.0.1:${backendPort}`;

    const crawlerLog = createLogSink(paths.logs, "crawler.log");
    crawler = await startAndWait(
      {
        name: "crawler",
        entry: paths.crawlerEntry,
        log: crawlerLog,
        env: {
          ...process.env,
          NODE_ENV: "production",
          CRAWLER_HOST: "127.0.0.1",
          CRAWLER_PORT: String(crawlerPort),
          PLAYWRIGHT_BROWSERS_PATH: paths.playwrightBrowsers,
        },
        onUnexpectedExit: (name, code) => {
          if (running) void childFailed(name, code);
        },
      },
      `${crawlerUrl}/health`,
      45_000,
    );

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
          SQLITE_MIGRATIONS_DIR: paths.backendMigrations,
          DATA_DIR: paths.data,
          WEB_DIST_DIR: paths.web,
          LOCATIONS_DATA_FILE: join(
            paths.backendMigrations,
            "..",
            "data",
            "locations.json.gz",
          ),
          CRAWLER_BASE_URL: crawlerUrl,
          SEARXNG_BASE_URL: selected.searxngUrl,
          OMNIROUTE_BASE_URL: selected.omnirouteUrl,
          OMNIROUTE_API_KEY: selected.omnirouteApiKey,
          OMNIROUTE_MODEL: selected.omnirouteModel,
          SURFACE_DESKTOP_TOKEN: desktopToken,
          SURFACE_SECRET_STORAGE: selected.secretStorage,
          PLAYWRIGHT_BROWSERS_PATH: paths.playwrightBrowsers,
        },
        onUnexpectedExit: (name, code) => {
          if (running) void childFailed(name, code);
        },
      },
      `${backendUrl}/api/health`,
      90_000,
    );

    await setDesktopCookie();
    registerIpc(settings);
    createWindow();
    running = true;
    startupLog.write(
      `[${new Date().toISOString()}] Surface ready at ${backendUrl}`,
    );
  } catch (error) {
    await fatal("Surface could not start", error);
  }
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
    if (!input.alt) return;
    if (input.key === "F9") {
      event.preventDefault();
      mainWindow.minimize();
    } else if (input.key === "F10") {
      event.preventDefault();
      toggleMaximize();
    }
  });
  const allowedOrigin = new URL(backendUrl).origin;
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
    if (target.origin !== allowedOrigin) {
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
  void mainWindow.loadURL(`${backendUrl}/`).catch(async (error) => {
    await fatal("Surface could not open its interface", error);
  });
  if (process.env.SURFACE_DESKTOP_SMOKE_TEST === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      void (async () => {
        try {
          const result = (await mainWindow?.webContents.executeJavaScript(
            `(async () => {
              const waitFor = async (selector, timeout = 10000) => {
                const started = Date.now();
                while (Date.now() - started < timeout) {
                  const element = document.querySelector(selector);
                  if (element) return element;
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
                throw new Error("Timed out waiting for " + selector);
              };
              // A fresh profile opens onboarding, while an onboarded profile
              // opens the workspace. Both routes render the frameless window
              // controls, so wait for those and then pick whichever drag
              // header the current route rendered.
              await waitFor(".desktop-window-controls");
              const header = await waitFor(
                ".workspace-header, .onboarding-top",
              );
              const [health, auth, status, jobs, research, schema] =
                await Promise.all([
                  fetch("/api/health").then((response) => response.json()),
                  fetch("/api/auth/session").then((response) => response.json()),
                  fetch("/api/desktop/status").then((response) => response.json()),
                  fetch("/api/jobs?page=1&relevance=all&limit=1").then((response) =>
                    response.json(),
                  ),
                  fetch("/api/research?page=1").then((response) =>
                    response.json(),
                  ),
                  fetch("/api/schema").then((response) => response.json()),
                ]);
              const before = await window.surfaceDesktop.getSettings();
              const saved = await window.surfaceDesktop.saveSettings({
                searxngUrl: before.searxngUrl,
                omnirouteUrl: before.omnirouteUrl,
                omnirouteModel: before.omnirouteModel,
                omnirouteApiKey: "smoke-test-key",
              });
              const after = await window.surfaceDesktop.getSettings();
              const windowBefore = await window.surfaceDesktop.getWindowState();
              const maximized = await window.surfaceDesktop.toggleMaximize();
              await new Promise((resolve) => setTimeout(resolve, 250));
              const windowAfter = await window.surfaceDesktop.getWindowState();
              await window.surfaceDesktop.toggleMaximize();
              await new Promise((resolve) => setTimeout(resolve, 250));
              const windowRestored = await window.surfaceDesktop.getWindowState();
              return {
                health,
                auth,
                status,
                jobs: { total: jobs.total, collectedTotal: jobs.collectedTotal },
                researchCompanies: Array.isArray(research) ? research.length : null,
                tables: Array.isArray(schema.tables) ? schema.tables.length : null,
                saved,
                after,
                chrome: {
                  controls: document.querySelectorAll(
                    ".desktop-window-controls button",
                  ).length,
                  environmentTag: Boolean(
                    document.querySelector(".environment-tag"),
                  ),
                  drag: getComputedStyle(header).getPropertyValue(
                    "-webkit-app-region",
                  ),
                  windowBefore,
                  maximized,
                  windowAfter,
                  windowRestored,
                },
              };
            })()`,
          )) as unknown;
          mainLog?.write(
            `SMOKE_READY ${JSON.stringify({ result, url: backendUrl })}`,
          );
          await delay(500);
          await shutdown(0);
        } catch (error) {
          await fatal("Surface smoke test failed", error);
        }
      })();
    });
  }
}

async function setDesktopCookie(): Promise<void> {
  await session.defaultSession.cookies.set({
    url: backendUrl,
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

function registerIpc(settings: SettingsStore): void {
  ipcMain.handle("desktop:settings:get", (event) => {
    assertTrustedSender(event);
    return settings.snapshot();
  });
  ipcMain.handle(
    "desktop:settings:save",
    async (event, input: DesktopSettingsInput) => {
      assertTrustedSender(event);
      const snapshot = await settings.save(input);
      const applied = await applyRuntimeSettings(settings.runtime());
      return { settings: snapshot, applied };
    },
  );
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
  const origin = new URL(frameUrl).origin;
  if (origin !== new URL(backendUrl).origin) {
    throw new Error("Untrusted desktop IPC sender.");
  }
}

async function applyRuntimeSettings(
  settings: DesktopSettingsSnapshot & { omnirouteApiKey: string },
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const response = await fetch(`${backendUrl}/api/desktop/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-surface-desktop-token": desktopToken,
      },
      body: JSON.stringify({
        searxngUrl: settings.searxngUrl,
        omnirouteUrl: settings.omnirouteUrl,
        omnirouteApiKey: settings.omnirouteApiKey,
        omnirouteModel: settings.omnirouteModel,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        error: body.error ?? `Backend returned HTTP ${response.status}.`,
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The running backend did not accept the settings.",
    };
  }
}

async function childFailed(name: string, code: number | null): Promise<void> {
  if (shuttingDown) return;
  const message = `${name} stopped unexpectedly (exit ${code ?? "unknown"}). See ${paths?.logs ?? "the log directory"}.`;
  mainLog?.write(`[${new Date().toISOString()}] ${message}`);
  await fatal("Surface stopped", new Error(message));
}

async function fatal(title: string, error: unknown): Promise<void> {
  if (shuttingDown) return;
  const message = error instanceof Error ? error.message : String(error);
  mainLog?.write(`[${new Date().toISOString()}] FATAL ${title}: ${message}`);
  if (app.isReady() && process.env.SURFACE_DESKTOP_SMOKE_TEST !== "1") {
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
    await crawler?.stop();
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
