import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./config/env";
import {
  closeDatabase,
  resolveMigrationsFolder,
} from "./infrastructure/database/client";
import { runMigrations } from "./infrastructure/database/migrate";
import { recoverResearch } from "./modules/research/research.service";
import { startExecutor } from "./modules/work/executor";

export interface SurfaceServer {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export async function startSurfaceServer(): Promise<SurfaceServer> {
  const migrationsFolder = resolveMigrationsFolder();
  await runMigrations();
  console.info(`Database ready (${migrationsFolder}).`);
  const smokeTest =
    Boolean(env.SURFACE_DESKTOP_TOKEN) &&
    process.env.SURFACE_DESKTOP_SMOKE_TEST === "1";
  if (!smokeTest) await recoverResearch();
  const stopExecutor = smokeTest ? async () => {} : await startExecutor();

  const server = serve({
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    const url = `http://${env.HOST}:${address.port}`;
    console.info(`Surface API listening on ${url}`);
    let stopped = false;
    return {
      port: address.port,
      url,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await stopExecutor();
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          setTimeout(resolve, 5000).unref();
        });
        await closeDatabase();
        console.info("Surface API stopped.");
      },
    };
  } catch (error) {
    await stopExecutor().catch(() => {});
    await closeDatabase().catch(() => {});
    throw error;
  }
}
