import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, "..");
const root = resolve(desktopDir, "../..");
const buildDir = join(desktopDir, "build");
const backendDir = join(root, "apps/backend");
const webDir = join(root, "apps/web");
const channel = process.env.SURFACE_DESKTOP_CHANNEL ?? "production";
if (channel !== "development" && channel !== "production") {
  throw new Error(
    `SURFACE_DESKTOP_CHANNEL must be "development" or "production", got "${channel}".`,
  );
}

console.info(`Surface desktop build (${channel} channel)`);
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

await step("web", async () => {
  run(
    process.execPath,
    [join(webDir, "node_modules/vite/bin/vite.js"), "build"],
    {
      cwd: webDir,
    },
  );
  cpSync(join(webDir, "dist"), join(buildDir, "web"), {
    recursive: true,
  });
});

await step("backend", async () => {
  const outdir = join(buildDir, "backend");
  mkdirSync(outdir, { recursive: true });
  await bundle(
    join(backendDir, "src/index.ts"),
    join(outdir, "index.mjs"),
    [],
    "esm",
  );
  cpSync(join(backendDir, "drizzle-sqlite"), join(outdir, "drizzle-sqlite"), {
    recursive: true,
  });
  mkdirSync(join(outdir, "data"), { recursive: true });
  copyFileSync(
    join(backendDir, "src/modules/profile/data/locations.json.gz"),
    join(outdir, "data/locations.json.gz"),
  );
  const developmentSeed = process.env.SURFACE_DEV_SEED_DIR;
  if (developmentSeed) {
    if (channel !== "development")
      throw new Error(
        "SURFACE_DEV_SEED_DIR is only allowed for development builds.",
      );
    if (!existsSync(join(developmentSeed, "surface.sqlite3")))
      throw new Error(
        `Development seed directory ${developmentSeed} has no surface.sqlite3.`,
      );
    cpSync(developmentSeed, join(outdir, "dev-seed"), { recursive: true });
    console.info(`Staged development seed from ${developmentSeed}`);
  }
});

await step("desktop shell", async () => {
  await bundle(
    join(desktopDir, "src/main.ts"),
    join(desktopDir, "dist/main.cjs"),
    ["electron"],
    "cjs",
  );
  await bundle(
    join(desktopDir, "src/preload.ts"),
    join(desktopDir, "dist/preload.cjs"),
    ["electron"],
    "cjs",
  );
});

await step("verify build layout", async () => {
  const required = [
    "web/index.html",
    "backend/index.mjs",
    "backend/drizzle-sqlite/meta/_journal.json",
    "backend/drizzle-sqlite/0000_wide_wither.sql",
    "backend/data/locations.json.gz",
  ];
  const missing = required.filter((file) => !existsSync(join(buildDir, file)));
  if (
    process.env.SURFACE_DEV_SEED_DIR &&
    !existsSync(join(buildDir, "backend/dev-seed/surface.sqlite3"))
  )
    missing.push("backend/dev-seed/surface.sqlite3");
  if (!existsSync(join(desktopDir, "resources/icon.png"))) {
    missing.push("resources/icon.png");
  }
  if (missing.length) {
    throw new Error(`Build is incomplete: ${missing.join(", ")}`);
  }
  console.info("Build layout verified.");
});

async function bundle(entry, outfile, external = [], format = "cjs") {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format,
    target: "node24",
    sourcemap: true,
    logLevel: "info",
    absWorkingDir: root,
    external,
    define: {
      SURFACE_DESKTOP_CHANNEL_BUILD: JSON.stringify(channel),
    },
    ...(format === "esm"
      ? {
          banner: {
            js: "import { createRequire as __surfaceCreateRequire } from 'node:module'; var require = __surfaceCreateRequire(import.meta.url);",
          },
        }
      : {}),
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

async function step(name, action) {
  console.info(`\n== ${name}`);
  await action();
}
