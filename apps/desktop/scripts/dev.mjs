import { spawn } from "node:child_process";
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  readdirSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:net";

// Launch a real Electron process even from a shell opened by another Electron app.
for (const name of [
  "ELECTRON_RUN_AS_NODE",
  "APPIMAGE",
  "APPDIR",
  "ARGV0",
  "OWD",
]) {
  delete process.env[name];
}
const electron = createRequire(import.meta.url)("electron");
const app = fileURLToPath(new URL("../", import.meta.url));
const web = join(app, "../web");
const args = process.argv.slice(2);
const backendPort = await getFreePort();
const webPort = Number(process.env.SURFACE_WEB_PORT) || 17400;
const rendererUrl = `http://127.0.0.1:${webPort}`;
const vite = spawn(
  process.execPath,
  [
    join(web, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(webPort),
    "--strictPort",
  ],
  {
    cwd: web,
    env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${backendPort}` },
    stdio: "inherit",
  },
);
let viteError;
vite.on("error", (error) => {
  viteError = error;
});
try {
  await waitForVite(vite, rendererUrl, () => viteError);
} catch (error) {
  vite.kill("SIGTERM");
  throw error;
}

const child = spawn(localElectron(electron, app, args), [app, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    SURFACE_DESKTOP_BACKEND_PORT: String(backendPort),
    SURFACE_DESKTOP_RENDERER_URL: rendererUrl,
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    child.kill(signal);
    vite.kill(signal);
  });
}
child.on("error", (error) => {
  console.error(`Could not start Surface Dev. ${error.message}`);
  vite.kill("SIGTERM");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  vite.kill("SIGTERM");
  process.exitCode = code ?? 1;
});

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForVite(childProcess, url, getStartError) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const startError = getStartError();
    if (startError)
      throw new Error(`Could not start Vite. ${startError.message}`);
    if (childProcess.exitCode !== null)
      throw new Error("Vite exited before the renderer was ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Vite did not become ready at ${url}.`);
}

// Ubuntu can require a setuid sandbox for the npm Electron binary. Reuse an
// installed helper in a separate runtime directory so the sandbox stays enabled.
function localElectron(executable, appDirectory, launchArgs) {
  if (process.platform !== "linux" || launchArgs.includes("--no-sandbox"))
    return executable;
  const source = dirname(executable);
  if (isSandboxHelper(join(source, "chrome-sandbox"))) return executable;
  const helper = [
    "/usr/lib/chromium/chrome-sandbox",
    "/opt/google/chrome/chrome-sandbox",
  ].find(isSandboxHelper);
  if (!helper) return executable;

  const runtime = join(appDirectory, "build", "local-electron");
  mkdirSync(runtime);
  symlinkSync(helper, join(runtime, "chrome-sandbox"));
  const binary = basename(executable);
  for (const file of readdirSync(source)) {
    if (file === "chrome-sandbox") continue;
    const original = join(source, file);
    const target = join(runtime, file);
    if (file === binary) {
      // Chromium locates its sandbox relative to the executable, so the
      // executable itself must live here rather than resolving a symlink.
      try {
        linkSync(original, target);
      } catch (error) {
        if (error.code !== "EXDEV") throw error;
        copyFileSync(original, target);
      }
    } else {
      symlinkSync(original, target);
    }
  }
  return join(runtime, binary);
}

function isSandboxHelper(file) {
  const info = statSync(file, { throwIfNoEntry: false });
  return Boolean(
    info?.isFile() && info.uid === 0 && (info.mode & 0o7777) === 0o4755,
  );
}
