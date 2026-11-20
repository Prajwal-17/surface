import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(appDirectory, "../..");

export default defineConfig(({ mode }) => {
  const appEnv = loadEnv(mode, appDirectory, "");
  const workspaceEnv = loadEnv(mode, workspaceDirectory, "");
  const webPort =
    Number(process.env.SURFACE_WEB_PORT ?? "") ||
    Number(appEnv.SURFACE_WEB_PORT ?? "") ||
    Number(workspaceEnv.SURFACE_WEB_PORT ?? "") ||
    17400;
  const backendUrl =
    process.env.BACKEND_URL ??
    appEnv.BACKEND_URL ??
    workspaceEnv.BACKEND_URL ??
    "http://localhost:14400";
  const apiProxy = {
    "/api": {
      target: backendUrl,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(appDirectory, "src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: webPort,
      proxy: apiProxy,
    },
    preview: {
      host: "0.0.0.0",
      port: webPort,
      proxy: apiProxy,
    },
  };
});
