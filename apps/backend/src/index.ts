// oxlint-disable-next-line import/no-unassigned-import -- start Surface's HTTP server
import { startSurfaceServer } from "./server";
import { initDesktopRenderChannel } from "./modules/desktop/render-channel";

// Runs under Electron only; attaches the backend end of the desktop channel
// used for rendered page fetches. No-op in standalone development.
initDesktopRenderChannel();

const server = await startSurfaceServer();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`Received ${signal}; stopping Surface.`);
  try {
    await server.stop();
    process.exitCode = 0;
  } catch (error) {
    console.error("Surface shutdown failed.", error);
    process.exitCode = 1;
  } finally {
    // The Electron launcher observes process exit; do not leave timers behind.
    process.exit(process.exitCode ?? 0);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
