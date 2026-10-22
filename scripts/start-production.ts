import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const port = Number.parseInt(process.env.FIELDWORK_PROD_WEB_PORT ?? "3001", 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("FIELDWORK_PROD_WEB_PORT must be a valid TCP port.");
}

const appUrl = `http://127.0.0.1:${port}/`;
const composeResult = spawnSync(
  "docker",
  ["compose", "up", "--build", "--detach"],
  { cwd: workspaceDirectory, stdio: "inherit" },
);

if (composeResult.error) throw composeResult.error;
if (composeResult.status !== 0) process.exit(composeResult.status ?? 1);

console.info(`Waiting for Surface at ${appUrl}`);
if (!(await waitForApp(appUrl))) {
  console.error(`Surface did not become ready at ${appUrl}.`);
  process.exit(1);
}

console.info(`Opening ${appUrl} in the default browser.`);
openDefaultBrowser(appUrl);

async function waitForApp(url: string): Promise<boolean> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return true;
    } catch {
      // The web container may still be starting.
    }
    await new Promise((done) => setTimeout(done, 1_000));
  }

  return false;
}

function openDefaultBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd.exe"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const browser = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  browser.once("error", () => {
    console.warn(`Could not launch a browser automatically. Open ${url}`);
  });
  browser.unref();
}
