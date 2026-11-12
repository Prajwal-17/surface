// oxlint-disable-next-line import/no-unassigned-import -- load .env before configuration is evaluated
import "dotenv/config";
import { startSurfaceServer } from "./server";

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
