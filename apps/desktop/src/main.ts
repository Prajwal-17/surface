import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
  utilityProcess,
} from "electron";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogSink, type LogSink } from "./logger";
import { desktopPaths, type DesktopPaths } from "./paths";
import { getFreePort } from "./ports";
import {
  startAndWait,
  type ManagedProcess,
} from "./processes";
import {
  SettingsStore,
  type DesktopSettingsInput,
  type DesktopSettingsSnapshot,
} from "./settings";

app.setName("Surface");
if (process.env.SURFACE_DESKTOP_USER_DATA) {
  app.setPath("userData", resolve(process.env.SURFACE_DESKTOP_USER_DATA));
}

const dataArgument = process.argv.indexOf("--surface-data");
if (dataArgument >= 0) {
  const dataArgs = process.argv.slice(dataArgument + 1);
  void app.whenReady().then(() => runDataCommand(dataArgs));
} else {
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

async function runDataCommand(args: string[]): Promise<void> {
  if (!args.length) {
    console.error(
      "Usage: surface --surface-data export|import|verify [options]\n" +
        "Import/verify default to the Surface user-data directory.",
    );
    app.exit(2);
    return;
  }
  const normalized = [...args];
  if (
    (normalized[0] === "import" || normalized[0] === "verify") &&
    !normalized.includes("--user-data")
  ) {
    normalized.push("--user-data", app.getPath("userData"));
  }
  const desktop = desktopPaths();
  const entry = desktop.dataCli;
  const child = utilityProcess.fork(entry, normalized, {
    env: {
      ...process.env,
      MIGRATIONS_DIR: desktop.backendMigrations,
      LOCATIONS_DATA_FILE: join(
        desktop.backendMigrations,
        "..",
        "data",
        "locations.json.gz",
      ),
    },
    stdio: "pipe",
    serviceName: "surface-data-command",
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk as Buffer));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk as Buffer));
  child.on("exit", (code) => app.exit(code ?? 1));
}

async function bootstrap(): Promise<void> {
  paths = desktopPaths();
  mkdirSync(paths.data, { recursive: true, mode: 0o700 });
  mkdirSync(paths.logs, { recursive: true, mode: 0o700 });
  mainLog = createLogSink(paths.logs, "desktop.log", { echo: true });
  const startupLog = mainLog;
  startupLog.write(
    `[${new Date().toISOString()}] Surface ${app.getVersion()} starting (electron ${process.versions.electron}, node ${process.versions.node}, packaged=${app.isPackaged})`,
  );
  startupLog.write(`userData=${paths.root}`);

  try {
    const settings = await SettingsStore.create(paths.settings);
    const selected = settings.runtime();
    startupLog.write(
      `settings loaded secretStorage=${selected.secretStorage} omnirouteConfigured=${Boolean(selected.omnirouteApiKey)}`,
    );

    const crawlerPort = Number(
      process.env.SURFACE_DESKTOP_CRAWLER_PORT,
    ) || (await getFreePort());
    let backendPort = Number(
      process.env.SURFACE_DESKTOP_BACKEND_PORT,
    ) || (await getFreePort());
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
          PGLITE_DATA_DIR: paths.database,
          DATA_DIR: paths.data,
          WEB_DIST_DIR: paths.web,
          MIGRATIONS_DIR: paths.backendMigrations,
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
    title: "Surface",
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
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) mainLog?.write(`[renderer] ${message}`);
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
              return {
                health,
                auth,
                status,
                jobs: { total: jobs.total, collectedTotal: jobs.collectedTotal },
                researchCompanies: Array.isArray(research) ? research.length : null,
                tables: Array.isArray(schema.tables) ? schema.tables.length : null,
                saved,
                after,
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
    assertTrustedSender(event.senderFrame?.url);
    return settings.snapshot();
  });
  ipcMain.handle(
    "desktop:settings:save",
    async (event, input: DesktopSettingsInput) => {
      assertTrustedSender(event.senderFrame?.url);
      const snapshot = await settings.save(input);
      const applied = await applyRuntimeSettings(settings.runtime());
      return { settings: snapshot, applied };
    },
  );
  ipcMain.handle("desktop:app:info", (event) => {
    assertTrustedSender(event.senderFrame?.url);
    return {
      version: app.getVersion(),
      packaged: app.isPackaged,
      dataDir: paths?.data ?? "",
      logsDir: paths?.logs ?? "",
      database: "PGlite",
    };
  });
  ipcMain.handle("desktop:open-data", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    if (paths) await shell.openPath(paths.data);
  });
}

function assertTrustedSender(frameUrl: string | undefined): void {
  if (!frameUrl) throw new Error("Untrusted desktop IPC sender.");
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
