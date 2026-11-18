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
const args = process.argv.slice(2);
const child = spawn(localElectron(electron, app, args), [app, ...args], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(`Could not start Surface Dev. ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

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
